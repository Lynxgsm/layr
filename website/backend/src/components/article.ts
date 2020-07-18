import {expose, validators} from '@liaison/component';
import {secondaryIdentifier, attribute, method} from '@liaison/storable';
import slugify from 'slugify';
import RSS from 'rss';
import escape from 'lodash/escape';

import {Entity} from './entity';
import {WithAuthor} from './with-author';

const frontendURL = process.env.FRONTEND_URL;

if (!frontendURL) {
  throw new Error(`'FRONTEND_URL' environment variable is missing`);
}

const backendURL = process.env.BACKEND_URL;

if (!backendURL) {
  throw new Error(`'BACKEND_URL' environment variable is missing`);
}

const {rangeLength} = validators;

@expose({
  get: {call: 'anyone'},
  find: {call: 'anyone'},
  count: {call: 'anyone'},
  prototype: {
    load: {call: 'anyone'},
    save: {call: 'author'},
    delete: {call: 'author'}
  }
})
export class Article extends WithAuthor(Entity) {
  @expose({get: 'anyone', set: 'author'})
  @attribute('string', {validators: [rangeLength([1, 200])]})
  title = '';

  @expose({get: 'anyone', set: 'author'})
  @attribute('string', {validators: [rangeLength([1, 2000])]})
  description = '';

  @expose({get: 'anyone', set: 'author'})
  @attribute('string', {validators: [rangeLength([1, 50000])]})
  body = '';

  @expose({get: 'anyone'})
  @secondaryIdentifier('string', {validators: [rangeLength([8, 300])]})
  slug = this.generateSlug();

  generateSlug() {
    this.validate({title: true});

    return (
      slugify(this.title, {remove: /[^\w\s-]/g}) +
      '-' +
      ((Math.random() * Math.pow(36, 6)) | 0).toString(36)
    );
  }

  // time curl -v -X POST -H "Content-Type: application/json" -d '{"query": {"Article=>": {"getRSSFeed=>result": {"()": []}}}, "source": "frontend"}' http://localhost:18888
  @expose({call: 'anyone'}) @method() static async getRSSFeed() {
    const articles = await this.find(
      {},
      {
        title: true,
        description: true,
        slug: true,
        author: {fullName: true},
        createdAt: true
      },
      {
        sort: {createdAt: 'desc'},
        limit: 10
      }
    );

    const feed = new RSS({
      title: 'Liaison Blog',
      description: 'A love story between the frontend and the backend',
      feed_url: `${backendURL}/blog/feed`,
      site_url: `${frontendURL}/blog`
    });

    for (const article of articles) {
      const url = `${frontendURL}/blog/articles/${article.slug}`;

      const description = `<p>${escape(
        article.description
      )}</p>\n<p><a href="${url}">Read more...</a></p>`;

      feed.item({
        url,
        title: article.title,
        description,
        author: article.author?.fullName,
        date: article.createdAt,
        guid: article.slug
      });
    }

    const xml = feed.xml({indent: true});

    return xml;
  }
}