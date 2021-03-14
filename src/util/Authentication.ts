/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import uuidv4 = require('uuid/v4');
import express = require('express');
import request = require('request');
import bodyParser = require('body-parser');
import http = require('http');
import opn = require('open');
import { planner } from 'pddl-workspace';

export class SAuthentication implements planner.Authentication {

    private sToken?: string;
    private accessToken?: string;
    private refreshToken?: string;

    constructor(private authUrl: string, private authRequestEncoded: string, private clientId: string, private callbackPort: number, private timeoutInMs: number,
        private tokensvcUrl: string, private tokensvcApiKey: string, private tokensvcAccessPath: string,
        private tokensvcValidatePath: string, private tokensvcCodePath: string, private tokensvcRefreshPath: string, private tokensvcSvctkPath: string,
        refreshToken: string, accessToken: string, sToken: string) {

        this.refreshToken = refreshToken;
        this.accessToken = accessToken;
        this.sToken = sToken;
        this.display();
    }

    getToken(): string | undefined {
        return this.sToken;
    }

    display(): void {
        console.log('URL: ' + this.authUrl);
        console.log('Request encoded: ' + this.authRequestEncoded);
        console.log('ClientId: ' + this.clientId);
        console.log('Callback port: ' + this.callbackPort);
        console.log('Timeout in ms: ' + this.timeoutInMs);
        console.log('Token Svc Url: ' + this.tokensvcUrl);
        console.log('Token Svc Api Key: ' + this.tokensvcApiKey);
        console.log('Token Svc Access Path: ' + this.tokensvcAccessPath);
        console.log('Token Svc Validate Path: ' + this.tokensvcValidatePath);
        console.log('Token Svc Code Path: ' + this.tokensvcCodePath);
        console.log('Token Svc Refresh Path: ' + this.tokensvcRefreshPath);
        console.log('Token Svc Svctk Path: ' + this.tokensvcSvctkPath);
        console.log('Refresh Token: ' + this.refreshToken);
        console.log('Access Token: ' + this.accessToken);
        console.log('S Token: ' + this.sToken);
    }

    login(onSuccess: (refreshToken: string, accessToken: string, sToken: string) => void, onError: (message: string) => void): void {
        const nonce = uuidv4();
        const app = express();
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({ extended: true }));
        let server: http.Server | undefined = undefined;
        const thisAuthentication = this;
        app.post('/auth/sauth/callback', function (req, res, next) {
            server?.close();
            if (req.body.nonce === nonce) {
                thisAuthentication.refreshToken = req.body.refreshtoken;
                thisAuthentication.accessToken = req.body.accesstoken;
                thisAuthentication.sToken = req.body.stoken;
                if (thisAuthentication.refreshToken && thisAuthentication.accessToken && thisAuthentication.sToken) {
                    onSuccess(thisAuthentication.refreshToken, thisAuthentication.accessToken, thisAuthentication.sToken);
                }
                res.sendStatus(200);
                next();
            }
            else {
                onError('Unexpected nonce: ' + req.body.nonce + ' (expected:' + nonce + ')');
                res.sendStatus(401);
                next();
            }
        });
        server = http.createServer(app);
        server.on('error', function (e) {
            onError(e.message);
        });
        server.listen(this.callbackPort);
        setTimeout(() => { server?.close(); }, this.timeoutInMs);

        const authUrl = this.authUrl + '?authRequest=' + this.authRequestEncoded + '&nonce=' + nonce + '&refreshtoken&accesstoken&stoken';
        opn(authUrl);
    }

    refreshTokens(onSuccess: (refreshToken: string, accessToken: string, sToken: string) => void, onError: (message: string) => void): void {
        if (this.sToken === undefined || this.sToken === "") {
            if (this.accessToken === undefined || this.accessToken === "") {
                if (this.refreshToken === undefined || this.refreshToken === "") {
                    this.refreshToken = undefined;
                    this.accessToken = undefined;
                    this.sToken = undefined;
                    onError("Refresh Tokens failed.");
                }
                else {
                    this.accessToken = undefined;
                    this.sToken = undefined;
                    this.refreshAccessAndSToken(onSuccess, onError);
                }
            }
            else {
                this.sToken = undefined;
                this.refreshSToken(onSuccess, onError);
            }
        }
        else {
            this.validateSToken(onSuccess, onError);
        }
    }

    refreshAccessAndSToken(onSuccess: (refreshToken: string, accessToken: string, sToken: string) => void, onError: (message: string) => void): void {
        const authentication = this;
        request.post({ url: this.tokensvcUrl + this.tokensvcRefreshPath + '?key=' + this.tokensvcApiKey + '&accesstoken=\'\'', json: { clientid: this.clientId, refreshtoken: this.refreshToken } },
            function (error, response, body) {
                if (!error && response.statusCode === 200 && !!body) {
                    authentication.accessToken = body.accesstoken;
                    authentication.refreshSToken(onSuccess, onError);
                }
                else {
                    authentication.accessToken = undefined;
                    authentication.sToken = undefined;
                    onError("Refresh Access Token failed.");
                }
            });
    }

    refreshSToken(onSuccess: (refreshToken: string, accessToken: string, sToken: string) => void, onError: (message: string) => void): void {
        const authentication = this;
        const url = this.tokensvcUrl + this.tokensvcAccessPath + '?key=' + this.tokensvcApiKey + '&stoken=\'\'';
        request.post({ url: url, json: { clientid: this.clientId, accesstoken: this.accessToken } },
            (error, response, body) => {
                if (!error && response.statusCode === 200 && !!body) {
                    authentication.sToken = body.stoken;
                    if (authentication.refreshToken && authentication.accessToken && authentication.sToken) {
                        onSuccess(authentication.refreshToken, authentication.accessToken, authentication.sToken);
                    }
                }
                else {
                    authentication.accessToken = undefined;
                    authentication.sToken = undefined;
                    onError("Refresh S Token failed.");
                }
            });
    }

    validateSToken(onSuccess: (refreshToken: string, accessToken: string, sToken: string) => void, onError: (message: string) => void): void {
        const authentication = this;
        request.post({ url: this.tokensvcUrl + this.tokensvcValidatePath + '?key=' + this.tokensvcApiKey, json: { clientid: this.clientId, audiences: this.clientId, stoken: this.sToken } },
            function (error, response, body) {
                if (!error && response.statusCode === 200 && !!body) {
                    authentication.sToken = authentication.sToken;
                    if (authentication.refreshToken && authentication.accessToken && authentication.sToken) {
                        onSuccess(authentication.refreshToken, authentication.accessToken, authentication.sToken);
                    }
                }
                else {
                    authentication.refreshSToken(onSuccess, onError);
                }
            });
    }
}