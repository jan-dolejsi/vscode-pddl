/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionContext } from 'vscode';
import { Delegate } from './Delegate';

export abstract class ContextDelegate extends Delegate {
    
    constructor(public context: CompletionContext){
        super();
    }

    enclose(snippetText: string): string {
        let enclosingStart = '';
        let enclosingEnd = '';
        if (this.context.triggerCharacter != "(") {
            enclosingStart = '(';
            enclosingEnd = ')';
        }

        return enclosingStart + snippetText + enclosingEnd;
    }
}