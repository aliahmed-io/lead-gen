export interface LeadMetadata{businessName:string;website:string;city:string;state:string;platform:string;rating:number|null;reviews:number|null;phone:string;websiteScore?:number;auditIssues?:string[];}
export interface PortfolioMatch{platform:string;caseStudyTitle:string;summary:string;techStack:string;demoUrl:string;recommendationSnippet:string;}
export interface ProposalDraft{id:string;title:string;price:string;timeline:string;deliverables:string[];draftText:string;}
