/*
 * Copyright (c) Jan Dolejsi 2023. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */
'use strict';

import { HoverProvider, TextEditor, TextEditorDecorationType, Range } from 'vscode';
import { DecorationRelativePosition, SyntaxAugmenter } from './SyntaxAugmenter';
import { CodeReplacement, Compilation, FileInfo } from 'pddl-workspace';

/** Compilation code-injections and code-replacements to the editor decorations and hovers.  */
export class CompilationAugmenter extends SyntaxAugmenter {
    isApplicable(_file: FileInfo): boolean {
        return true;
    }
    getHoverProvider(): HoverProvider | undefined {
        return undefined
    }
    protected createDecorations(editor: TextEditor, fileInfo: FileInfo): TextEditorDecorationType[] {
        return [...fileInfo.getCompilations().getAll().values()]
            .flatMap(compilations => compilations)
            .map(compilation => this.createDecoration(compilation, editor))
    }

    createDecoration(compilation: Compilation, editor: TextEditor): TextEditorDecorationType {
        const decorationText = compilation.code;
        const hoverText = this.toMarkdown(compilation.documentation);
        const doc = editor.document;
        let range: Range;
        if (compilation instanceof CodeReplacement) {
            range = new Range(doc.positionAt(compilation.offset),
                doc.positionAt(compilation.offset + compilation.removedCodeLength));
        } else {
            const insertionPosition = doc.positionAt(compilation.offset);
            range = new Range(insertionPosition, insertionPosition);
        }
        
        const margin = !decorationText.startsWith('(');
        return this.decorateSymbol(editor, decorationText, hoverText, range, {
            relativePosition: DecorationRelativePosition.After,
            margin: margin,
        });
    }
}