/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
// COPY OF FILE IN ai-planning-val.js


import * as https from 'https';
import * as http from 'http';
import * as fs from 'fs';
import { URL } from 'url';

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

/**
 * Post JSON body and expects JSON response.
 * @param url url to call
 * @param content content to post
 * @param headers headers to add
 * @returns returned body
 * @throws HttpStatusError if the status code >= 300
 */
export async function postJson<O>(url: URL, content: unknown, headers?: NodeJS.Dict<string>): Promise<O> {
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

export class HttpStatusError extends Error {
    constructor(public readonly statusCode: number, public readonly statusMessage: string | undefined, public readonly url: URL){
        super(`Status code ${statusCode}, ${statusMessage} from ${url}`);
    }
}
