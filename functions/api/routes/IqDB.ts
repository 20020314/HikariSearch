import * as cheerio from 'cheerio';
import { json, StatusError } from 'itty-router-extras';
import * as _ from 'lodash';
import Schema from 'schemastery';
import { router } from '../router';
import { validate } from '../utils';

export const BASE_URL = 'https://iqdb.org/';

export enum IqDBServices {
  danbooru = 1,
  konachan = 2,
  yandere = 3,
  gelbooru = 4,
  sankaku_channel = 5,
  e_shuushuu = 6,
  zerochan = 11,
  anime_pictures = 13,
}

export function parse(body: string) {
  const $ = cheerio.load(body);
  return _.map($('table'), (result) => {
    const content = $(result).text(),
      [link] = $('td.image > a', result),
      [image] = $('td.image img', result);
    if (!link) return;
    const [, similarity] = content.match(/(\d+%)\s*similarity/)!,
      [, resolution, level] = content.match(/(\d+×\d+)\s*\[(\w+)\]/)!;
    return {
      url: new URL(link.attribs.href, BASE_URL).toString(),
      image: new URL(image.attribs.src, BASE_URL).toString(),
      similarity: parseFloat(similarity),
      resolution,
      level: level.toLowerCase(),
    };
  })
    .filter(<T>(v: T | undefined): v is T => v !== undefined)
    .sort((a, b) => a.similarity - b.similarity)
    .reverse();
}

export const schema = Schema.object({
  services: Schema.array(
    Schema.transform(
      Schema.union(
        Object.values(IqDBServices).filter(
          <T extends string>(s: T | number): s is T => typeof s === 'string'
        ) as (keyof typeof IqDBServices)[]
      ),
      (v) => IqDBServices[v]
    )
  ),
  discolor: Schema.boolean().default(false),
  image: Schema.is(File).required(),
});

router.post('/IqDB', async (request: Request) => {
  const { services, discolor, image } = await validate(request, schema);
  const form = new FormData();
  if (services) services.forEach((s) => form.append('service[]', s.toString()));
  if (discolor) form.append('forcegray', 'on');
  form.append('file', image!);
  const response = await fetch(BASE_URL, { method: 'POST', body: form })
    .then((res) => res.text())
    .catch((err: Error) => {
      throw new StatusError(502, err.message);
    });
  return json(parse(response));
});