/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    Uri, TextDocumentContentProvider, Event, EventEmitter, CancellationToken, ExtensionContext
} from 'vscode';

import { Plan } from "../../../common/src/Plan";
import { PlanReportGenerator } from './PlanReportGenerator';

export class PlanDocumentContentProvider implements TextDocumentContentProvider {
    private _onDidChange = new EventEmitter<Uri>();
    private plans: Plan[]; // todo: this should not be a field, but a map against the Uri

    displayWidth = 200;
            
    constructor(public context: ExtensionContext) {}

    get onDidChange(): Event<Uri> {
        return this._onDidChange.event;
    }

    public update(uri: Uri, plans: Plan[]) {
        this.plans = plans;
        this._onDidChange.fire(uri);
    }

    provideTextDocumentContent(uri: Uri, token: CancellationToken): string | Thenable<string> {
        if (token.isCancellationRequested) return "Canceled";

        // Todo: when supporting multiple plan panes, look this up: " + uri.toString());// todo: should pick up the  plan using the uri
        uri; // waste it to avoid the compile warning

        return new PlanReportGenerator(this.context, this.displayWidth, false).generateHtml(this.plans);
    }
}
