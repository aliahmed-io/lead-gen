'use strict';

/**
 * Rule-Based Template Personalizer
 * Generates contextually relevant opening sentences for cold emails
 * using scraped metadata (platform, city, state, businessName, website).
 */

const PLATFORM_SENTENCES = {
  Shopify: [
    "I was looking at your store on Shopify while searching for home & decor brands in {{city}}...",
    "I noticed your site is built on Shopify — it's really well structured for direct-to-consumer sales.",
    "Came across your Shopify store and was impressed by your product page layout.",
  ],
  WooCommerce: [
    "I noticed you built your store on WooCommerce while looking through businesses in {{city}}...",
    "Was browsing your WooCommerce site and really liked how your product catalog is organized.",
    "Came across your WooCommerce store and wanted to compliment your product showcase.",
  ],
  Magento: [
    "I noticed your enterprise store runs on Magento — very solid setup for high-volume catalog sales.",
    "Was looking at your Magento store and was impressed by your scale and product depth.",
  ],
  WordPress: [
    "I came across your website on WordPress and loved the aesthetic you've built for your brand.",
    "I noticed your website design on WordPress — really stylish user experience.",
  ],
  Other: [
    "I came across your website and was really impressed by what you've built.",
    "I was browsing your online store and really loved your product collection.",
    "Your store design is really clean, and I just had to get in touch.",
  ]
};

const CITY_SENTENCES = [
  "Hope business is treating you well in {{city}}!",
  "Always great to connect with top home & decor brands based in {{city}}.",
  "We've been doing a lot of work with retailers across {{state}}, including brands in {{city}}.",
];

/**
 * Personalizer interface implementation.
 */
class TemplatePersonalizer {
  /**
   * Generates a tailored opening sentence for a cold outreach email.
   *
   * @param {object} lead - Lead record with businessName, platform, city, state, website
   * @returns {string} Personalization sentence
   */
  generateOpener(lead = {}) {
    const platform = lead.platform || 'Other';
    const city = lead.city ? lead.city.trim() : '';
    const state = lead.state ? lead.state.trim() : '';

    const platformTemplates = PLATFORM_SENTENCES[platform] || PLATFORM_SENTENCES.Other;
    const mainOpener = platformTemplates[Math.floor(Math.random() * platformTemplates.length)];

    if (city && Math.random() > 0.5) {
      const cityTemplate = CITY_SENTENCES[Math.floor(Math.random() * CITY_SENTENCES.length)];
      const citySentence = cityTemplate.replace('{{city}}', city).replace('{{state}}', state || 'your region');
      return `${mainOpener} ${citySentence}`;
    }

    return mainOpener;
  }
}

const defaultPersonalizer = new TemplatePersonalizer();

module.exports = {
  TemplatePersonalizer,
  generatePersonalizedOpener: (lead) => defaultPersonalizer.generateOpener(lead),
};
