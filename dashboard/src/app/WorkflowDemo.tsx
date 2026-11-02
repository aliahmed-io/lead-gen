'use client';

import {useState} from 'react';
import {ArrowUpRight, Check, Search, Mail, ShieldCheck} from 'lucide-react';

const stages = [
  {title: 'Find the right business.', description: 'A relevant business, with its source attached.', icon: Search},
  {title: 'Look beyond an email.', description: 'Review the person, the business, and the evidence.', icon: ShieldCheck},
  {title: 'Begin a conversation.', description: 'Bring the research into a thoughtful first message.', icon: Mail},
];

export default function WorkflowDemo() {
  const [step,setStep]=useState(0);
  const Icon=stages[step].icon;
  return <div className="lg-demo" aria-label="Interactive example workflow">
    <div className="lg-demo-top"><span><span className="lg-demo-dot"/> The connection engine</span><span>Illustrative demo</span></div>
    <div className="lg-demo-scene" data-step={step}>
      <div className="lg-orbit lg-orbit-one" aria-hidden="true"/><div className="lg-orbit lg-orbit-two" aria-hidden="true"/>
      <span className="lg-scene-word" aria-hidden="true">CONNECT</span>
      <div className="lg-source-chip"><Search size={13}/> Independent furniture studios <span>↵</span></div>
      <div className="lg-paper lg-paper-back" aria-hidden="true"><span>Website evidence</span><div/><div/><div/></div>
      <div className="lg-paper lg-paper-middle" aria-hidden="true"><ShieldCheck size={20}/><strong>People before lists.</strong><span>Source → Review → Conversation</span></div>
      <div className="lg-paper lg-paper-front" key={step}>
        <div className="lg-paper-heading"><span className="lg-demo-icon"><Icon size={22}/></span><span>Example contact<br/><strong>Fieldwork Studio</strong></span><ArrowUpRight size={19}/></div>
        {step===0?<div className="lg-demo-record"><p>Independent furniture & objects</p><dl><div><dt>Website</dt><dd>fieldwork.example</dd></div><div><dt>Source</dt><dd>Public contact page</dd></div><div><dt>Next step</dt><dd>Review evidence</dd></div></dl></div>:step===1?<div className="lg-demo-record"><p>A considered contact starts here.</p><ul><li><Check size={15}/> Inspect the source</li><li><Check size={15}/> Confirm business fit</li><li><ShieldCheck size={15}/> Verify before enrollment</li></ul></div>:<div className="lg-demo-message"><span>Draft · not sent</span><strong>A thought for Fieldwork</strong><p>Hi there,<br/>I came across your furniture collection and had an idea for making the pieces easier to explore online.</p><span>Personal context. A clear reason to connect.</span></div>}
        <div className="lg-paper-footer"><span>{['Research first','Your review matters','A conversation, with context'][step]}</span><span>0{step+1} / 03</span></div>
      </div>
      <span className="lg-evidence-chip"><ShieldCheck size={14}/> You stay in control</span>
    </div>
    <div className="lg-demo-caption" aria-live="polite"><h2>{stages[step].title}</h2><p>{stages[step].description}</p></div>
    <div className="lg-demo-controls" role="group" aria-label="Explore the example workflow">{stages.map(({icon:StageIcon},index)=><button type="button" key={index} aria-pressed={step===index} onClick={()=>setStep(index)}><StageIcon size={15}/><span>{['Research','Review','Reach out'][index]}</span><span className="lg-control-index">0{index+1}</span></button>)}</div>
  </div>;
}
