/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as request from 'request';
import * as fs from 'fs';

export function getJson(url: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
        request.get(url, { json: true }, (error: any, httpResponse: request.Response, body: any) => {
            if (error) {
                reject(error);
            }
            else {
                if (httpResponse && httpResponse.statusCode !== 200) {
                    reject("HTTP status code " + httpResponse.statusCode);
                }
                else {
                    resolve(body);
                }
            }
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
                    reject("HTTP status code " + httpResponse.statusCode);
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
                    reject("HTTP status code " + httpResponse.statusCode);
                }
                else {
                    resolve(body);
                }
            }
        });
    });
}