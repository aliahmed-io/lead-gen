'use strict';

/**
 * Deterministic Freelance Proposal Templates
 * 1-click generation of professional proposal drafts populating client name,
 * company, estimated price range, deliverables, and timeline.
 */

const PROPOSAL_TEMPLATES = {
  landing_page: {
    id: 'landing_page',
    title: 'High-Converting Landing Page Redesign',
    defaultPrice: '$1,500 – $2,500',
    timeline: '7 – 10 Days',
    deliverables: [
      'Custom UI/UX Figma Design',
      'Mobile-Responsive Development (Next.js / Tailwind)',
      'Sub-1s Page Speed Optimization & SEO Basics',
      'Contact Form & Lead Capture Integration',
      'Google Analytics / Tracking Event Setup'
    ],
    generateDraft: ({ name, company, price, timeline }) => `Hi ${name || 'there'},

Thanks for reaching out! Based on your website for ${company || 'your brand'}, here is a proposed scope for a high-converting landing page redesign:

📋 Deliverables:
• Custom UI/UX Design tailored to your brand
• High-performance mobile-responsive build
• Sub-1s page load optimization (LCP < 1.0s)
• Lead capture form & CRM/Email integration
• Complete SEO & event analytics setup

💰 Investment: ${price || '$1,500 – $2,500'}
⏱️ Estimated Timeline: ${timeline || '7 – 10 Days'}

Let me know if this aligns with your goals, and we can schedule a quick 10-minute call to finalize details!

Best regards,
Ali Ahmed | Aethelon Labs`
  },

  ecommerce: {
    id: 'ecommerce',
    title: 'E-commerce Store Optimization & Redesign',
    defaultPrice: '$1,500 – $2,500',
    timeline: '10 – 14 Days',
    deliverables: [
      'Custom Shopify / WooCommerce Store Redesign',
      'Checkout Funnel & Cart Optimization',
      'Mobile Performance Audit & Image Compression',
      'Custom Product Filter & Search Enhancement',
      'Payment Gateway & Automated Email Integration'
    ],
    generateDraft: ({ name, company, price, timeline }) => `Hi ${name || 'there'},

Great connecting! Here is the tailored proposal for modernizing your online store at ${company || 'your brand'}:

📋 Deliverables:
• Custom E-commerce Store Layout (Shopify / WooCommerce)
• Optimized One-Page Checkout & Cart experience
• Mobile speed optimization (4.0s -> 1.2s target load time)
• Advanced Product Filtering & Search
• Payment gateway setup & Abandoned cart flow integration

💰 Investment: ${price || '$1,500 – $2,500'}
⏱️ Estimated Timeline: ${timeline || '10 – 14 Days'}

Happy to jump on a quick call to walk through example store case studies!

Best regards,
Ali Ahmed | Aethelon Labs`
  },

  fullstack_app: {
    id: 'fullstack_app',
    title: 'Custom Full-Stack Web Application',
    defaultPrice: '$2,500 – $4,000',
    timeline: '2 – 3 Weeks',
    deliverables: [
      'Next.js 16 + TypeScript Application Architecture',
      'PostgreSQL Database & Secure API Gateway',
      'User Authentication & Role-Based Permissions',
      'Stripe Payment & Subscription Management',
      'Real-time Dashboard Analytics UI'
    ],
    generateDraft: ({ name, company, price, timeline }) => `Hi ${name || 'there'},

Here is the proposed technical scope for building the custom web application for ${company || 'your business'}:

📋 Deliverables:
• Next.js 16 + TypeScript full-stack web application
• PostgreSQL database schema & REST/GraphQL APIs
• User Auth, Dashboard UI, and Role-Based Permissions
• Stripe billing integration (Subscriptions & Invoices)
• Automated CI/CD deployment & hosting setup

💰 Investment: ${price || '$2,500 – $4,000'}
⏱️ Estimated Timeline: ${timeline || '2 – 3 Weeks'}

Looking forward to bringing this build to life!

Best regards,
Ali Ahmed | Aethelon Labs`
  }
};

module.exports = {
  PROPOSAL_TEMPLATES,
  getProposalTemplate: (id) => PROPOSAL_TEMPLATES[id] || PROPOSAL_TEMPLATES.landing_page,
};
