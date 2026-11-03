const object = (properties, required) => ({type:'object',additionalProperties:false,properties,required});
const label = {type:'string',minLength:1,maxLength:200};
export const caseTools = [
  {
    name:'search_cases',
    description:'Search public judicial, administrative, or business examples. Returns draft research candidates, exact source kinds, and analogy limits; never a legal clearance.',
    inputSchema:object({query:label,kind:{enum:['judgment','administrative_action','business_example']},limit:{type:'integer',minimum:1,maximum:10}},['query'])
  },
  {
    name:'get_case',
    description:'Read one case UUID or registry key. Separates allegations, reported facts, findings and outcomes; later history and present applicability remain explicit.',
    inputSchema:object({id:label},['id'])
  },
  {
    name:'explore_topic',
    description:'Map a topic such as NFT, NDA, or 下請法 to research questions, related cases, guidance and differences. Missing case kinds are explicit. Private facts are not stored.',
    inputSchema:object({topic:label,limit:{type:'integer',minimum:1,maximum:20}},['topic'])
  }
];
