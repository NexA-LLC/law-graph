export const comparativeTools=[{
 name:'compare_issue',
 description:'Compare a shared copyright research issue across explicitly selected jurisdictions. Keeps originals, translations, editions and differences separate. Does not assert equivalence or choose applicable law.',
 inputSchema:{type:'object',additionalProperties:false,required:['issue','jurisdictions'],properties:{
  issue:{type:'string',minLength:1,maxLength:200},
  jurisdictions:{type:'array',minItems:2,maxItems:2,uniqueItems:true,items:{type:'string',minLength:1,maxLength:100}}
 }}
}];
