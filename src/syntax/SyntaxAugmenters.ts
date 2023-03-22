/*
 * Copyright (c) Jan Dolejsi 2023. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */
'use strict';

import { PDDL } from 'pddl-workspace';
import { ExtensionContext, languages, HoverProvider } from 'vscode';
import { SyntaxAugmenter } from './SyntaxAugmenter';


/**
 * Syntax augmenter registrar.
 */
export class SyntaxAugmenters {
    private syntaxAugmenters: SyntaxAugmenter[] = [];

    public register(syntaxAugmenter: SyntaxAugmenter) {
        this.syntaxAugmenters.push(syntaxAugmenter);
    }

    registerAll(context: ExtensionContext) {
        this.syntaxAugmenters.forEach(syntax => {
            if ((syntax as unknown as HoverProvider).provideHover) {
                context.subscriptions.push(languages.registerHoverProvider(PDDL, syntax as unknown as HoverProvider));
            }
        });
    }
}