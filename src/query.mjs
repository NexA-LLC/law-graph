import { snapshotId } from './identity.mjs';

export function createQuery(graph) {
  const all = new Map();
  for (const collection of Object.values(graph)) if (Array.isArray(collection)) {
    for (const record of collection) if (record.id) all.set(record.id, record);
  }
  const byId = key => all.get(key);
  const days = [...new Set(graph.coverage.map(x => x.as_of))].sort();
  function summarizeCoverage(c) {
    const { locators, ...metadata } = c;
    return { ...metadata, article_locators: locators.filter(x => /^main\/article:[^/]+$/.test(x)), provision_locator_count: locators.length };
  }
  function context(asOf) {
    const selected = asOf ?? days.at(-1);
    const coverage = graph.coverage.filter(c => c.as_of === selected);
    return {
      schema_version: graph.schema_version, snapshot_id: snapshotId(graph),
      requested_as_of: asOf ?? null, evaluated_as_of: selected,
      status: coverage.length ? 'ok' : 'outside_coverage',
      available_as_of: days, coverage: (coverage.length ? coverage : graph.coverage).map(summarizeCoverage)
    };
  }
  function eligible(record, asOf) {
    const active = graph.coverage.filter(c => c.as_of === asOf);
    if (graph.law_revisions.some(r => r.id === record.id)) return active.some(c => c.law_revision_id === record.id);
    if (record.law_revision_id) return active.some(c => c.law_revision_id === record.law_revision_id);
    if (record.anchor_revision_id) return active.some(c => c.law_revision_id === record.anchor_revision_id);
    if (record.law_id) return active.some(c => c.law_id === record.law_id || c.law_revision_id === record.id);
    return active.some(c => c.law_revision_id === record.id || c.law_id === record.id);
  }
  function provenance(record) {
    return (record.evidence_ref_ids ?? []).map(key => {
      const evidence = byId(key);
      const version = byId(evidence.source_version_id);
      const source = byId(version.source_id);
      return {
        evidence_ref_id: evidence.id, source_version_id: version.id, source_id: source.id,
        upstream_ids: { ...source.upstream_ids, revision_id: version.upstream_revision_id },
        source_url: source.url, retrieval_url: version.retrieval_url, locator: evidence.locator,
        content_sha256: version.content_sha256, text_sha256: evidence.text_sha256
      };
    });
  }
  function brief(record) {
    if (!record) return null;
    const { text, ...fields } = record;
    return fields;
  }
  return {
    coverage() { return { ...context(), coverage: graph.coverage, counts: Object.fromEntries(Object.entries(graph).filter(([,v]) => Array.isArray(v)).map(([k,v]) => [k,v.length])) }; },
    search_provisions({ query, as_of: asOf, limit = 10 }) {
      const ctx = context(asOf);
      if (ctx.status !== 'ok') return { ...ctx, results: [], total_matches: 0, truncated: false };
      const tokens = query.normalize('NFKC').trim().split(/\s+/u).filter(Boolean);
      if (!tokens.length) throw new Error('query must not be blank');
      const matches = graph.provision_versions.filter(p => eligible(p, ctx.evaluated_as_of)).map(p => {
        const title = byId(p.law_revision_id).title;
        const haystack = (title + ' ' + p.text).normalize('NFKC');
        const score = tokens.every(t => haystack.includes(t)) ? tokens.reduce((n,t) => n + haystack.split(t).length - 1, 0) + (p.level === 'Paragraph' ? 10 : 0) : 0;
        return { p, score };
      }).filter(x => x.score > 0).sort((a,b) => b.score - a.score || a.p.locator.localeCompare(b.p.locator));
      return {
        ...ctx, total_matches: matches.length, truncated: matches.length > limit,
        results: matches.slice(0, limit).map(({p,score}) => ({
          id: p.id, locator: p.locator, law_revision_id: p.law_revision_id,
          title: byId(p.law_revision_id).title, score, excerpt: p.text.slice(0, 600),
          excerpt_truncated: p.text.length > 600, provenance: provenance(p)
        }))
      };
    },
    resolve_citation({ law_id: lawId, article, paragraph, item, as_of: asOf }) {
      const ctx = context(asOf);
      if (ctx.status !== 'ok') return { ...ctx, results: [] };
      if (item && !paragraph) throw new Error('item requires paragraph');
      const law = graph.laws.find(x => x.upstream_law_id === lawId);
      const locator = 'main/article:' + article + (paragraph ? '/paragraph:' + paragraph : '') + (item ? '/item:' + item : '');
      const results = law ? graph.provision_versions.filter(p => eligible(p, ctx.evaluated_as_of) &&
        byId(p.law_revision_id).law_id === law.id && p.locator === locator) : [];
      return {
        ...ctx, status: results.length ? 'ok' : 'outside_coverage', results: results.map(p => ({
          ...brief(p), provenance: provenance(p)
        }))
      };
    },
    get_provision({ id: key, as_of: asOf, max_chars: maxChars = 8000 }) {
      const ctx = context(asOf);
      const p = graph.provision_versions.find(x => x.id === key);
      if (ctx.status !== 'ok') return { ...ctx, result: null };
      if (!p) return { ...ctx, status: 'not_found_in_graph', result: null };
      if (!eligible(p, ctx.evaluated_as_of)) return { ...ctx, status: 'outside_coverage', result: null };
      return {
        ...ctx, result: { ...p, text: p.text.slice(0, maxChars), text_truncated: p.text.length > maxChars, provenance: provenance(p) }
      };
    },
    traverse_relations({ id: startId, as_of: asOf, depth = 1, limit = 50, types, direction = 'out' }) {
      const ctx = context(asOf);
      const start = byId(startId);
      if (ctx.status !== 'ok') return { ...ctx, nodes: [], relations: [], truncated: false };
      if (!start) return { ...ctx, status: 'not_found_in_graph', nodes: [], relations: [], truncated: false };
      if (!eligible(start, ctx.evaluated_as_of)) return { ...ctx, status: 'outside_coverage', nodes: [], relations: [], truncated: false };
      const visited = new Set([startId]);
      const used = new Set();
      const queue = [[startId, 0]];
      const result = [];
      let depthLimited = false;
      let truncated = false;
      for (let index = 0; index < queue.length; index++) {
        const [nodeId, distance] = queue[index];
        const edges = graph.relations.filter(r => eligible(byId(r.from_id), ctx.evaluated_as_of) && !used.has(r.id) && (!types || types.includes(r.type)) &&
          ((direction !== 'in' && r.from_id === nodeId) || (direction !== 'out' && r.to_id === nodeId)));
        if (distance >= depth) { if (edges.length) depthLimited = true; continue; }
        for (const edge of edges) {
          if (result.length >= limit) { truncated = true; break; }
          used.add(edge.id);
          result.push({ ...edge, provenance: provenance(edge) });
          const other = edge.from_id === nodeId ? edge.to_id : edge.from_id;
          if (other && !visited.has(other)) { visited.add(other); queue.push([other, distance + 1]); }
        }
        if (truncated) break;
      }
      return {
        ...ctx, nodes: [...visited].map(key => brief(byId(key))),
        relations: result, truncated, depth_limited: depthLimited,
        unresolved_count: result.filter(r => r.resolution === 'unresolved').length
      };
    }
  };
}
