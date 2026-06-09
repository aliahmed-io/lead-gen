/**
 * EDIT THIS FILE TO CUSTOMIZE YOUR OUTREACH EMAILS
 * 
 * Variables you can use inside the `data` object:
 * ${data.companyName}    - The name of the business
 * ${data.website}        - Their website URL
 * ${data.city}           - The city they are located in
 * ${data.state}          - The state they are located in
 * ${data.platform}       - Their website platform (e.g., Shopify, WooCommerce)
 * ${data.customSentence} - A generated sentence based on their platform (Initial Email only)
 */

module.exports = {

  // =======================================================================
  // 1. INITIAL OUTREACH EMAIL
  // =======================================================================
  
  getInitialEmail: (data) => {
    return {
      subject: `Quick question for ${data.companyName}`,
      text: `Hi ${data.companyName} team,

Hope you're having a great week!

${data.customSentence} 

[YOUR PITCH GOES HERE - e.g. We help stores like yours in ${data.city} increase conversions by X%]

Would you be open to a quick 5-minute chat next week to see if there's a fit?

Best,
Your Name
Your Title
Your Company`
    };
  },

  // =======================================================================
  // 2. FIRST FOLLOW-UP EMAIL (Sent 3 days later if no reply)
  // =======================================================================

  getFollowUpEmail1: (data) => {
    return {
      subject: `Re: Quick question for ${data.companyName}`,
      text: `Hi ${data.companyName} team,

I know things get busy, so I'm just bubbling this up to the top of your inbox. 

Are you currently exploring any solutions for [YOUR VALUE PROP]? 

If not, no worries! Just let me know.

Best,
Your Name`
    };
  },

  // =======================================================================
  // 3. SECOND FOLLOW-UP EMAIL (Sent 4 days after first follow-up if no reply)
  // =======================================================================

  getFollowUpEmail2: (data) => {
    return {
      subject: `Re: Quick question for ${data.companyName}`,
      text: `Hi ${data.companyName} team,

I'm reaching out one last time to see if [YOUR VALUE PROP] is on your radar right now. 

If it's not a priority at the moment, I completely understand and won't bother you again. 

Thanks for your time!

Best,
Your Name`
    };
  }
  
};
Are you currently exploring any solutions for [YOUR VALUE PROP]? 

If not, no worries! Just let me know.

Best,
Your Name`
    };
  },

  // =======================================================================
  // 3. SECOND FOLLOW-UP EMAIL (Sent 4 days after first follow-up if no reply)
  // =======================================================================

  getFollowUpEmail2: (companyName) => {
    return {
      subject: `Re: Quick question for ${companyName}`,
      text: `Hi ${companyName},

I'm reaching out one last time to see if [YOUR VALUE PROP] is on your radar right now. 

If it's not a priority at the moment, I completely understand and won't bother you again. 

Thanks for your time!

Best,
Your Name`
    };
  }
  
};
