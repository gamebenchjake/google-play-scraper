'use strict';

const request = require('./utils/request');
const cheerio = require('cheerio');
const R = require('ramda');

const c = require('./constants');

function reviews (opts) {
  return new Promise(function (resolve, reject) {
    validate(opts);

    const options = Object.assign({
      method: 'POST',
      uri: 'https://play.google.com/store/getreviews',
      form: {
        pageNum: opts.page || 0,
        id: opts.appId || opts.id,
        reviewSortOrder: opts.sort || c.sort.NEWEST,
        hl: opts.lang || 'en',
        reviewType: 0,
        xhr: 1
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/38.0.2125.111 Safari/537.36'
      },
      json: true,
      followAllRedirects: true
    }, opts.requestOptions);

    request(options, opts.throttle)
      .then(function (body) {
        const response = JSON.parse(body.slice(6));
        return response[0][2];
      })
      .then(cheerio.load)
      .then(parseFields)
      .then(resolve)
      .catch((err) => {
        // as of 2/10/2018 google fails with a 400 status starting on page 112
        // assuming no more results when status is 400
        if (err.status === 400) {
          return resolve([]);
        }
        reject(err);
      });
  });
}

function getUserImage ($, handle) {
  const spanElem = $(handle).find('span[class=responsive-img-hdpi] > span');
  const style = spanElem.length && spanElem.css('background-image');
  // Style is in the form of url(https://lh5.googleusercontent.com/.../photo.jpg)
  const match = style && style.match('url\\((.*)\\)');
  return match ? match[1] : undefined;
}

function parseFields ($) {
  const result = [];

  const reviewsContainer = $('div[class=single-review]');
  reviewsContainer.each(function (i) {
    const id = $(this).find('div[class=review-header]').data('reviewid').trim();
    const info = $(this).find('div[class=review-info]');
    const userName = $(this).find('span[class=author-name]').text().trim();
    const userImage = getUserImage($, this);
    const date = $(this).find('span[class=review-date]').text().trim();
    const score = parseInt(filterScore($(this).find('.star-rating-non-editable-container').attr('aria-label').trim()));
    const url = 'https://play.google.com' + info.find('.reviews-permalink').attr('href');

    const reviewContent = $(this).find('.review-body');
    const title = reviewContent.find('span[class=review-title]').text().trim();
    reviewContent.find('.review-link').remove();
    const text = reviewContent.text().trim();

    const developerComment = $(this).next('.developer-reply');
    let replyDate;
    let replyText;
    if (developerComment.length) {
      replyDate = developerComment.find('span.review-date').text().trim();
      replyText = developerComment.children().remove().end().text().trim();
    }

    const allInfo = {
      id,
      userName,
      userImage,
      date,
      url,
      score,
      title,
      text,
      replyDate,
      replyText
    };

    result[i] = allInfo;
  });
  return result;
}

function validate (opts) {
  if (!opts || !opts.appId) {
    throw Error('appId missing');
  }

  if (opts.sort && !R.contains(opts.sort, R.values(c.sort))) {
    throw new Error('Invalid sort ' + opts.sort);
  }
  if (opts.page && opts.page < 0) {
    throw new Error('Page cannot be lower than 0');
  }
}

function filterScore (score) {
  // take the lower number, they're switched in japanese language
  const numbers = score.match(/([0-5])/g);
  return R.apply(Math.min, numbers);
}

module.exports = reviews;
