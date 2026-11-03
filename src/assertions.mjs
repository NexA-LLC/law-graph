import { id } from './identity.mjs';

// Unlike the legacy extractor, the assertion identity includes every claim field.
export function assertion(fields) {
  const content = { ...fields, review_state: 'unreviewed' };
  return { id: id('assertion', content), ...content };
}

export function validateAssertion(relation, { all, get, check }) {
  const { id: key, ...content } = relation;
  check(key === id('assertion', content), 'Assertion identity mismatch');
  const from = all.get(relation.from_id);
  const to = all.get(relation.to_id);
  check((relation.resolution === 'resolved') === Boolean(to), 'Assertion resolution mismatch');
  check(Boolean(to) === (relation.target_ref === null), 'Assertion target reference mismatch');
  const provisions = relation.basis_provision_ids.map(key => get('provision_versions', key));
  const evidence = new Set(provisions.flatMap(p => p.evidence_ref_ids));
  check(relation.evidence_ref_ids.every(key => evidence.has(key)) &&
    provisions.every(p => p.evidence_ref_ids.some(key => relation.evidence_ref_ids.includes(key))), 'Assertion evidence mismatch');
  if (relation.type === 'relates_to') {
    check(from.kind === 'intents' && ['law_revisions', 'provision_versions'].includes(to?.kind) &&
      relation.method === 'intent-curation-v1' && relation.basis === 'curated', 'Invalid Intent assertion');
    check(provisions.every(p => to.kind === 'provision_versions' ? p.id === to.id : p.law_revision_id === to.id), 'Intent basis target mismatch');
  } else if (relation.type === 'administered_by') {
    check(from.kind === 'law_revisions' && to?.kind === 'authorities' &&
      relation.method === 'egov-authority-inference-v1' && relation.basis === 'textual_inference' &&
      provisions.every(p => p.law_revision_id === from.id), 'Invalid authority assertion');
    // This is an explicitly labelled inference from minister/ministry mentions.
    check(to.label === '国土交通省' && provisions.some(p => /国土交通(?:大臣|省令)/u.test(p.text)), 'Unsupported authority inference');
  } else {
    check(from.kind === 'provision_versions' && provisions.some(p => p.id === from.id) &&
      relation.method === 'egov-references-v1' && relation.basis === 'explicit_text', 'Invalid reference assertion');
    check(!to || ['law_revisions', 'provision_versions'].includes(to.kind), 'Invalid reference target');
    if (relation.type === 'delegates_to') {
      check(!to || to.kind === 'provision_versions', 'Delegation requires a precise implementing provision');
      check(!to || provisions.some(p => p.id === to.id), 'Delegation requires implementing evidence');
    }
  }
}
