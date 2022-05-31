/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as request from 'request';
import { get } from 'http';
import * as fs from 'fs';
import { URL } from 'url';

/**
 * Get using `request` npm package.
 * @param url url
 * @returns returned structure
 * @deprecated use getJson2
 */
export function getJson(url: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
        request.get(url, { json: true }, (error: any, httpResponse: request.Response, body: any) => {
            if (error) {
                reject(error);
            }
            else {
                if (httpResponse && httpResponse.statusCode !== 200) {
                    reject(new Error("HTTP status code " + httpResponse.statusCode));
                }
                else {
                    resolve(body);
                }
            }
        });
    });
}

export async function getJson2<T>(url: URL): Promise<T> {
    return await new Promise((resolve, reject) => {
        get(url, res => {
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

export function getFile(url: string, localFilePath: string): Promise<void> {
    const localFile = fs.createWriteStream(localFilePath);

    return new Promise<void>((resolve, reject) => {
        request.get(url)
            .on('response', function (response) {
                console.log("Downloading %s. Content-type: %s, Status code: %d", url, response.headers['content-type'], response.statusCode);
                if (response.statusCode >= 400) {
                    reject(new Error("Downloading VAL binaries failed with HTTP status code " + response.statusCode));
                }
            })
            .on('error', function (err) {
                reject(err);
            })
            .pipe(localFile)
            .on("close", () => resolve());
    });
}

export function getText(url: string): string | PromiseLike<string> {
    return new Promise<string>((resolve, reject) => {
        request.get(url, (error: any, httpResponse: request.Response, body: any) => {
            if (error) {
                reject(error);
            }
            else {
                if (httpResponse && httpResponse.statusCode !== 200) {
                    reject(new Error("HTTP status code " + httpResponse.statusCode));
                }
                else {
                    resolve(body);
                }
            }
        });
    });
}

export function postJson(url: string, content: any): Promise<any> {
    return new Promise<string>((resolve, reject) => {
        request.post(url, { body: content, json: true }, (error: any, httpResponse: request.Response, body: any) => {
            if (error) {
                reject(error);
            }
            else {
                if (httpResponse && httpResponse.statusCode > 204) {
                    reject(new Error("HTTP status code " + httpResponse.statusCode));
                }
                else {
                    resolve(body);
                }
            }
        });
    });
}