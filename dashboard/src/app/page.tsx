import Link from 'next/link';
import {ArrowUpRight, Search, Mail, SlidersHorizontal, ShieldCheck, Layers, CornerDownRight} from 'lucide-react';
import './landing.css';
import './wow.css';
import WorkflowDemo from './WorkflowDemo';

const features = [
  {icon: Search, title: 'Research before reaching out.', text: 'Find businesses, inspect their websites, and keep the source behind each contact.', href: '/leadgen', link: 'Explore lead generation'},
  {icon: ShieldCheck, title: 'Keep a human in the loop.', text: 'Review ownership, check contact evidence, and choose who belongs in a campaign.', href: '/research', link: 'Open owner review'},
  {icon: Mail, title: 'Give every reply a home.', text: 'Keep conversations together in one inbox, with the context you need to respond.', href: '/inbox', link: 'Explore the inbox'},
];
export default function LandingPage() {
  return <div className="lg-landing">
    <a className="lg-skip" href="#landing-main">Skip to content</a>
    <header className="lg-nav"><Link href="/" className="lg-brand"><span className="lg-mark" aria-hidden="true">↗</span> LeadGen<span className="lg-project">Personal project</span></Link><nav aria-label="Landing navigation"><a href="#workflow">How it works</a><a href="#workspace">The workspace</a><Link href="/overview" className="lg-button lg-small">Open workspace <ArrowUpRight size={16}/></Link></nav></header>
    <main id="landing-main">
      <section className="lg-hero">
        <div className="lg-hero-copy"><p className="lg-kicker"><span/> Research. Review. Reach out.</p>
        <h1>A clearer way<br/>to find your<br/>next client.</h1>
        <p className="lg-intro">A personal outreach workspace for freelancers. Find relevant businesses, review real contacts, and manage email conversations in one place.</p>
        <div className="lg-actions"><Link href="/overview" className="lg-button">Explore the workspace <ArrowUpRight size={18}/></Link><a href="#workflow" className="lg-plain">See how it works <CornerDownRight size={18}/></a></div>
        <p className="lg-note">Built for one operator. You decide who to contact.</p>
        </div><WorkflowDemo />
      </section>
      <section id="workflow" className="lg-section lg-workflow"><div className="lg-section-heading"><p className="lg-kicker">The process</p><h2>Less scattered work.<br/>More considered outreach.</h2><p>Move through a simple workflow, with a review between finding a contact and sending a message.</p></div><ol className="lg-steps">{[['Find your fit','Search for businesses relevant to your work. Keep website and contact sources attached.'],['Review the evidence','Check ownership, suitability, and email verification before enrolling a contact.'],['Reach out with context','Prepare a sequence, review readiness, and follow the conversation in your inbox.']].map(([title,text],i)=><li key={title}><span>{String(i+1).padStart(2,'0')}</span><h3>{title}</h3><p>{text}</p></li>)}</ol></section>
      <section id="workspace" className="lg-section lg-features"><div className="lg-section-heading"><p className="lg-kicker">One workspace</p><h2>The whole picture.<br/>Without the tab hopping.</h2></div><div className="lg-feature-grid">{features.map(({icon:Icon,title,text,href,link})=><article key={title}><Icon size={30} strokeWidth={1.4}/><h3>{title}</h3><p>{text}</p><Link href={href}>{link}<ArrowUpRight size={16}/></Link></article>)}</div></section>
      <section className="lg-section lg-control"><div><p className="lg-kicker">Deliberate by design</p><h2>Your outreach.<br/>Your decisions.</h2><p>This is a working tool for personal use. Research supports your judgment; it does not replace it. Sending depends on your configuration and readiness checks.</p><Link href="/launch" className="lg-button lg-outline">See launch checks <ArrowUpRight size={18}/></Link></div><div className="lg-checklist">{[[ShieldCheck,'Review before enrollment','Inspect contact evidence and verification.'],[SlidersHorizontal,'Set your own boundaries','Configure sender identity, pacing, and limits.'],[Layers,'Keep the history','Review activity, suppressions, and uncertain deliveries.']].map(([Icon,title,text])=>{const Symbol=Icon as typeof ShieldCheck;return <div key={String(title)}><Symbol size={23}/><div><h3>{String(title)}</h3><p>{String(text)}</p></div></div>;})}</div></section>
      <section id="questions" className="lg-section lg-faq"><div className="lg-section-heading"><p className="lg-kicker">A little context</p><h2>Before you open it.</h2></div><div>{[['What is LeadGen?','A personal project that brings business research, contact review, email sequences, and replies into a single workspace for freelance outreach.'],['Is this a commercial service?','No. This is a single-operator tool, not a subscription product or a shared customer platform. There are no paid plans on this page.'],['Does opening the workspace send emails?','No. Opening the dashboard does not start the sending worker. Sending requires separate setup, an explicitly running campaign, and passing readiness checks.'],['Where should I start?','Open the overview, configure your sender settings, then review Accounts and Health center. Research and verify contacts before enrolling a small segment.']].map(([q,a])=><details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div></section>
      <section className="lg-closing"><p className="lg-kicker">From a name to a conversation</p><h2>Make your next<br/>connection count.</h2><p>Start with the research. Keep the context. Take the next step when you are ready.</p><Link href="/overview" className="lg-button">Open your workspace <ArrowUpRight size={18}/></Link></section>
    </main><footer className="lg-footer"><Link href="/" className="lg-brand">↗ LeadGen</Link><p>A personal project for thoughtful outreach.</p><a href="#landing-main">Back to top ↑</a></footer>
  </div>;
}
