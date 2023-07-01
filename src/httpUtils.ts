/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
// COPY OF FILE IN ai-planning-val.js


import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import { URL } from 'url';
import FormData = require('form-data');
import zlib = require('zlib');

function get(url: URL): (options: http.RequestOptions | string | URL, callback?: (res: http.IncomingMessage) => void) => http.ClientRequest {
    return url.protocol === 'https:' ? https.get : http.get;
}

function request(url: URL): (url: string | URL, options: http.RequestOptions, callback?: (res: http.IncomingMessage) => void) => http.ClientRequest {
    return url.protocol === 'https:' ? https.request : http.request;
}

export async function getJson<T>(url: URL): Promise<T> {
    return await new Promise((resolve, reject) => {
        get(url)(url, res => {
            if (res.statusCode && res.statusCode >= 300) {
                reject(new Error(`Status code ${res.statusCode}, ${res.statusMessage} from ${url}`));
                res.resume();
                return;
            }
            const contentType = res.headers['content-type'];
            if (!contentType || !/^application\/json/.test(contentType)) {
                reject(new Error('Invalid content-type.\n' +
                    `Expected application/json but received ${contentType} from ${url}`));
                res.resume();
                return;
            }
            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(rawData);
                    // console.log(parsedData);
                    resolve(parsedData);
                } catch (e: unknown) {
                    console.error(e);
                    reject(e);
                }
            });
        });
    });
}

export function getFile(url: URL, localFilePath: string): Promise<void> {
    const localFile = fs.createWriteStream(localFilePath);

    return new Promise<void>((resolve, reject) => {
        get(url)(url, res => {
            if (res.statusCode && res.statusCode >= 300) {
                reject(new Error(`Status code ${res.statusCode}, ${res.statusMessage} from ${url}`));
                res.resume();
                return;
            }
            console.log("Downloading %s. Content-type: %s, Status code: %d", url, res.headers['content-type'], res.statusCode);
            if (res.statusCode && res.statusCode >= 400) {
                reject(new Error("Downloading VAL binaries failed with HTTP status code " + res.statusCode));
            }
            res.on('error', err => {
                reject(err);
            });

            // pipe the stream to a file and wait for it to finish
            res.pipe(localFile)
            .on('finish', () => {
                console.log("Downloaded %s to %s", url, localFilePath);
                resolve();
            }).on('error', err => {
                reject(err);
            });
        });
    });
}

export async function getText(url: URL): Promise<string> {
    return await new Promise((resolve, reject) => {
        get(url)(url, res => {
            if (res.statusCode && res.statusCode >= 300) {
                reject(new Error(`Status code ${res.statusCode}, ${res.statusMessage} from ${url}`));
                res.resume();
                return;
            }
            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                resolve(rawData);
            });
        });
    });
}

const CONTENT_TYPE = 'Content-Type';
const APPLICATION_JSON = 'application/json';

/**
 * Post JSON body and expects JSON response.
 * @param url url to call
 * @param content content to post
 * @param headers headers to add
 * @returns returned body
 * @throws HttpStatusError if the status code >= 300
 */
export async function postJson<O>(url: URL, content: unknown, headers?: NodeJS.Dict<string>): Promise<O> {
    headers = headers ?? {};
    if (! (CONTENT_TYPE in headers)) {
        headers[CONTENT_TYPE] = APPLICATION_JSON;
    }
    return await new Promise((resolve, reject) => {
        request(url)(url, {headers: headers, method: "POST"}, res => {
            if (res.statusCode && res.statusCode >= 300) {
                reject(new HttpStatusError(res.statusCode, res.statusMessage, url));
                res.resume();
                return;
            }
            const contentType = res.headers['content-type'];
            if (!contentType || !/^application\/json/.test(contentType)) {
                reject(new Error('Invalid content-type.\n' +
                    `Expected application/json but received ${contentType} from ${url}`));
                res.resume();
                return;
            }
            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(rawData);
                    // console.log(parsedData);
                    resolve(parsedData);
                } catch (e: unknown) {
                    console.error(e);
                    reject(e);
                }
            });
        }).end(JSON.stringify(content));
    });
}


/**
 * Post JSON body and expects JSON response.
 * @param url url to call
 * @param content content to post
 * @param headers headers to add
 * @returns returned body
 * @throws HttpStatusError if the status code >= 300
 */
export async function postMultipart<O>(url: URL, content: FormData, auth?: string, headers?: NodeJS.Dict<string>): Promise<O> {
    headers = headers ?? {};
    // if (! (CONTENT_TYPE in headers)) {
    //     headers[CONTENT_TYPE] = 'multipart/form-data';
    // }
    const allHeaders = content.getHeaders(headers);

    return await new Promise((resolve, reject) => {
        request(url)(url, {headers: allHeaders, method: "POST", auth: auth }, res => {
            if (res.statusCode && res.statusCode >= 300) {
                reject(new HttpStatusError(res.statusCode, res.statusMessage, url));
                res.resume();
                return;
            }
            const contentType = res.headers['content-type'];
            if (!contentType || !/^application\/json/.test(contentType)) {
                reject(new Error('Invalid content-type.\n' +
                    `Expected application/json but received ${contentType} from ${url}`));
                res.resume();
                return;
            }
            res.setEncoding('utf8');
            let rawData = '';
            res.on('data', (chunk) => { rawData += chunk; });
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(rawData);
                    // console.log(parsedData);
                    resolve(parsedData);
                } catch (e: unknown) {
                    console.error(e);
                    reject(e);
                }
            });
        }).end(content.getBuffer());
    });
}

export class HttpStatusError extends Error {
    constructor(public readonly statusCode: number, public readonly statusMessage: string | undefined, public readonly url: URL){
        super(`Status code ${statusCode}, ${statusMessage} from ${url}`);
    }
}

export async function gzip(content: string): Promise<Buffer> {
    return await new Promise((resolve, reject) => {
        zlib.gzip(content, (error, result) => {
            if (!error) {
                resolve(result);
            } else {
                reject(error);
            }
        });
    });
}