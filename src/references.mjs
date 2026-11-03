import { assertion } from './assertions.mjs';
import { id } from './identity.mjs';

export const REFERENCE_METHOD = 'egov-references-v1';

// Remove immediate provision descendants to avoid extracting the same sentence
// again from its Article, Paragraph, Item and Subitem ancestors.
export function directText(graph, p) {
  let text = p.text;
  for (const child of graph.provision_versions.filter(c => c.law_revision_id === p.law_revision_id &&
    c.locator.slice(0, c.locator.lastIndexOf('/')) === p.locator)) text = text.replace(child.text, '');
  return text;
}

function numeral(s) {
  if (/^\d+$/u.test(s)) return String(Number(s));
  const digits = { '〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  const units = { '十': 10, '百': 100, '千': 1000 };
  let n = 0, digit = 0;
  for (const c of s) {
    if (c in units) { n += (digit || 1) * units[c]; digit = 0; }
    else digit = digits[c];
  }
  return String(n + digit);
}

export function extractReferences(graph) {
  const byId = new Map([...graph.laws, ...graph.law_revisions, ...graph.provision_versions].map(p => [p.id, p]));
  const days = revision => graph.coverage.filter(c => c.law_revision_id === revision).map(c => c.as_of);
  const simultaneous = (a, b) => days(a).some(day => days(b).includes(day));
  const nodes = graph.provision_versions.filter(p => p.level !== 'Article');
  const texts = new Map(nodes.map(p => [p.id, directText(graph, p)]));
  const aliases = [];
  for (const p of nodes) {
    const text = texts.get(p.id);
    for (const revision of graph.law_revisions) {
      for (const alias of ['法', '令']) if (text.includes(revision.title + '（以下「' + alias + '」という。）')) {
        aliases.push({ revision: p.law_revision_id, alias, target: revision, provision: p });
      }
    }
  }
  const results = new Map();
  const add = fields => {
    const record = assertion(fields);
    results.set(record.id, record);
  };
  function fields(type, p, to, targetRef, reason, basis = [p]) {
    const provisions = [...new Map(basis.map(p => [p.id, p])).values()].sort((a,b) => a.id.localeCompare(b.id));
    return { type, from_id: p.id, to_id: to?.id ?? null, target_ref: to ? null : targetRef,
      basis: 'explicit_text', method: REFERENCE_METHOD, resolution: to ? 'resolved' : 'unresolved', reason,
      basis_provision_ids: provisions.map(p => p.id), evidence_ref_ids: [...new Set(provisions.flatMap(p => p.evidence_ref_ids))].sort() };
  }
  const num = '[〇零一二三四五六七八九十百千0-9]+';
  const articlePattern = new RegExp('第(' + num + ')条((?:の' + num + ')*)(?:第(' + num + ')項)?(?:第(' + num + ')号)?', 'gu');
  for (const p of nodes) {
    const text = texts.get(p.id);
    const revision = byId.get(p.law_revision_id);
    for (const match of text.matchAll(articlePattern)) {
      const before = text.slice(0, match.index);
      const withoutParenthesis = before.replace(/（[^（）]*）$/u, '');
      let candidates, basis = [p], qualifier = '';
      const named = graph.law_revisions.filter(r => withoutParenthesis.endsWith(r.title)).sort((a,b) => b.title.length - a.title.length);
      if (named.length) {
        qualifier = named[0].title;
        candidates = named.filter(r => r.title === qualifier && simultaneous(p.law_revision_id, r.id));
      } else if (/(?:この法律|この政令|この省令)$/u.test(before)) {
        qualifier = before.match(/(?:この法律|この政令|この省令)$/u)[0];
        candidates = [revision];
      } else if (/[法令]$/u.test(before)) {
        qualifier = before.at(-1);
        // A longer unrecognised law name must not be shortened to the alias 法/令.
        if (/[\p{Script=Han}ァ-ヶー][法令]$/u.test(before)) candidates = [];
        else {
          const found = aliases.filter(a => a.revision === p.law_revision_id && a.alias === qualifier && simultaneous(p.law_revision_id, a.target.id));
          candidates = [...new Map(found.map(a => [a.target.id, a.target])).values()];
          basis.push(...found.map(a => a.provision));
        }
      } else if (!before || /(?:[、。「（]|及び|又は|若しくは|する|の|は|に|から|と|を|る|て)$/u.test(before)) {
        candidates = [revision];
      } else candidates = [];
      const article = [numeral(match[1]), ...match[2].split('の').filter(Boolean).map(numeral)].join('_');
      const locator = 'main/article:' + article + (match[3] ? '/paragraph:' + numeral(match[3]) : '') + (match[4] ? '/item:' + numeral(match[4]) : '');
      const targets = graph.provision_versions.filter(t => candidates.some(r => r.id === t.law_revision_id) && t.locator === locator);
      const target = targets.length === 1 ? targets[0] : null;
      const raw = qualifier + match[0];
      add(fields('cites', p, target, { raw, expected_kind: 'Provision', locator },
        'Literal reference ' + raw + '; exact revision and locator must be collected on the same observation day.', basis));
    }
    for (const match of text.matchAll(/前[条項]|同[条項]|次条/gu)) {
      add(fields('cites', p, null, { raw: match[0], expected_kind: 'Provision' },
        'Context-dependent relative reference retained without inferring its antecedent.'));
    }
  }
  const citations = [...results.values()];
  for (const p of nodes) {
    for (const phrase of new Set(texts.get(p.id).match(/(?:政令|国土交通省令)で定める/gu) ?? [])) {
      const kind = phrase.startsWith('政令') ? 'CabinetOrder' : 'MinisterialOrdinance';
      const implementations = citations.filter(c => c.to_id === p.id).filter(c => {
        const target = byId.get(c.from_id);
        const law = byId.get(byId.get(target.law_revision_id).law_id);
        const correctKind = kind === 'CabinetOrder' ? /^\d{3}CO/u.test(law.upstream_law_id) : /^\d{3}M/u.test(law.upstream_law_id);
        const targetText = texts.get(target.id);
        // Only narrowly recognised implementation clauses, not arbitrary mentions.
        return correctKind && /第[〇零一二三四五六七八九十百千0-9]+(?:条|項)(?:の[〇零一二三四五六七八九十百千0-9]+)*(?:第[〇零一二三四五六七八九十百千0-9]+項)?の(?:国土交通省令で定める|規定により)/u.test(targetText);
      });
      if (!implementations.length) add(fields('delegates_to', p, null, { raw: phrase, expected_kind: kind },
        'Delegation phrase has no collected implementing clause with a resolved back-reference.'));
      for (const c of implementations) {
        const target = byId.get(c.from_id);
        add(fields('delegates_to', p, target, null,
          'Delegation phrase ' + phrase + ' matched to a same-day implementation clause citing this exact provision; rule-extracted and unreviewed.',
          [p, ...c.basis_provision_ids.map(key => byId.get(key))]));
      }
    }
  }
  return [...results.values()].sort((a,b) => a.id.localeCompare(b.id));
}

export function inferAuthorities(graph) {
  const authority = { id: id('authority', 'JP', '国土交通省'), jurisdiction: 'JP', label: '国土交通省' };
  const relations = [];
  for (const revision of graph.law_revisions) {
    const p = graph.provision_versions.filter(p => p.law_revision_id === revision.id && p.level !== 'Article' &&
      /国土交通(?:大臣|省令)/u.test(directText(graph, p))).sort((a,b) => a.locator.localeCompare(b.locator))[0];
    if (p) relations.push(assertion({ type: 'administered_by', from_id: revision.id, to_id: authority.id, target_ref: null,
      basis: 'textual_inference', method: 'egov-authority-inference-v1', resolution: 'resolved',
      reason: '国土交通大臣・国土交通省令への言及に基づく所管候補。正式な所管府省一覧ではなく、未確認の推定。',
      evidence_ref_ids: p.evidence_ref_ids, basis_provision_ids: [p.id] }));
  }
  return { authorities: relations.length ? [authority] : [], relations };
}
