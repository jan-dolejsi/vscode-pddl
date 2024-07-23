/*
 * Copyright (c) Jan Dolejsi 2023. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */
'use strict';

import { ExtensionContext, HoverProvider, TextEditor, TextEditorDecorationType, window, Range, ThemableDecorationAttachmentRenderOptions, DecorationRenderOptions, MarkdownString } from 'vscode';
import { CompilationDocumentation, DomainInfo, FileInfo, PDDL, PddlWorkspace } from 'pddl-workspace';
import { CodePddlWorkspace } from '../workspace/CodePddlWorkspace';
import { isPddl } from '../workspace/workspaceUtils';
import { SymbolUtils } from '../symbols/SymbolUtils';
import { toURI } from '../utils';

/** Base class for all syntax augmenters. */
export abstract class SyntaxAugmenter {
    protected symbolUtils: SymbolUtils;
    protected dirtyEditors = new Set<TextEditor>();
    protected timeout: NodeJS.Timeout | undefined = undefined;
    protected decorations = new Map<TextEditor, TextEditorDecorationType[]>();

    constructor(context: ExtensionContext, protected readonly pddlWorkspace: CodePddlWorkspace) {
        this.symbolUtils = new SymbolUtils(pddlWorkspace);
        window.onDidChangeActiveTextEditor(editor =>
            editor && this.scheduleDecoration(editor), null, context.subscriptions);
        pddlWorkspace.pddlWorkspace.on(PddlWorkspace.UPDATED, updatedFile => {
            if (updatedFile instanceof DomainInfo) {
                window.visibleTextEditors
                    .filter(editor => editor.document.uri.toString() === updatedFile.fileUri.toString())
                    .forEach(editor => this.scheduleDecoration(editor));
            }
        });
        window.visibleTextEditors.forEach(editor => this.scheduleDecoration(editor));
    }
    
    abstract isApplicable(file: FileInfo): boolean;
    abstract getHoverProvider(): HoverProvider | undefined;

    /**
     * Schedules decoration refresh, if applicable.
     * @param editor active editor
     */
    scheduleDecoration(editor: TextEditor): void {
        if (editor.visibleRanges.length && isPddl(editor.document)) {

            this.triggerDecorationRefresh(editor);
        }
    }

    private triggerDecorationRefresh(editor: TextEditor): void {
        this.dirtyEditors.add(editor);
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = undefined;
        }
        this.timeout = setTimeout(() => this.refreshDirtyEditors(), 1000);
    }

    private refreshDirtyEditors(): void {
        const currentlyDirtyEditors = new Set<TextEditor>(this.dirtyEditors);
        this.dirtyEditors.clear();

        currentlyDirtyEditors
            .forEach(editor => this.updateDecoration(editor));
    }

    private updateDecoration(editor: TextEditor): void {
        if (editor.visibleRanges.length === 0) { return; }
        const fileInfo = this.pddlWorkspace.pddlWorkspace.getFileInfo(toURI(editor.document.uri));

        if (fileInfo) {

            this.decorations.get(editor)?.forEach(d => d.dispose());
            this.decorations.delete(editor);

            const newDecorations = this.createDecorations(editor, fileInfo);

            this.decorations.set(editor, newDecorations);
        }
    }

    protected decorateSymbol(editor: TextEditor, decorationText: string, hoverText: MarkdownString | string, range: Range, options: { italic?: boolean, relativePosition: DecorationRelativePosition, margin?: boolean }): TextEditorDecorationType {
        const fontStyle = 'font-style:' + (options.italic ? 'italic' : '') + ';';
        const margin = options.margin ? 'margin-left: 10px; ' : '';
        const textDecoration = fontStyle + "color: gray; " + margin; //font-size: 10px; ; opacity: 0.5
        
        const d: ThemableDecorationAttachmentRenderOptions = {
            contentText: decorationText,
            textDecoration: textDecoration,
        };

        const decRenderOptions: DecorationRenderOptions = {};

        switch (options.relativePosition) {
            case DecorationRelativePosition.Before:
                decRenderOptions.before = d;
                break;
            case DecorationRelativePosition.After:
                decRenderOptions.after = d;
                break;
        }

        const decorationType = window.createTextEditorDecorationType(decRenderOptions);
        editor.setDecorations(decorationType, [{ range: range, hoverMessage: hoverText }]);
        return decorationType;
    }

    protected abstract createDecorations(editor: TextEditor, fileInfo: FileInfo): TextEditorDecorationType[];

    protected toMarkdown(documentation: CompilationDocumentation): MarkdownString {
        const md = new MarkdownString(documentation.title).appendMarkdown('\n\n');
        documentation.codeblock &&
            md.appendCodeblock(documentation.codeblock, PDDL);
        return md;
    }
}


export enum DecorationPosition {
    InsideStart,
    InsideEnd,
    OutsideEnd,
}

export enum DecorationRelativePosition {
    Before,
    After
}