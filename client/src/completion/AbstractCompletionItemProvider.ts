/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, CompletionContext, CompletionItemKind, SnippetString, Range, CompletionTriggerKind, MarkdownString } from 'vscode';
import { DomainInfo } from '../../../common/src/DomainInfo';
import { PddlSyntaxNode } from '../../../common/src/PddlSyntaxNode';
import { ProblemInfo } from '../../../common/src/ProblemInfo';

export class AbstractCompletionItemProvider {

    protected suggestionDetails: Map<string, SuggestionDetails>;

    constructor() {
        this.suggestionDetails = new Map<string, SuggestionDetails>();
    }
    
    addSuggestionDocumentation(label: string, detail: string, documentation: string | MarkdownString, kind?: CompletionItemKind): void {
        let details = new SuggestionDetails(label, detail, documentation, kind);
        this.suggestionDetails.set(details.label, details);
    }

    protected insideDefine(domainInfo: DomainInfo | ProblemInfo, currentNode: PddlSyntaxNode, context: CompletionContext): boolean {
        let defineNode = domainInfo.syntaxTree.getDefineNode();
        if (context.triggerKind === CompletionTriggerKind.Invoke) {
            return currentNode.getParent() === defineNode;
        }
        else {
            const enclosingScope = currentNode.expand();
            return enclosingScope.getToken().tokenText.match(/^\(\s*:?$/) !== null
                && enclosingScope.getParent() === defineNode;
        }
    }

    protected createSnippetCompletionItem(suggestion: Suggestion, snippet: string, range: Range, _context: CompletionContext, index: number): CompletionItem {
        let suggestionDetail = this.suggestionDetails.get(suggestion.sectionName);
        let completionItem = new CompletionItem(suggestion.sectionName, (suggestionDetail && suggestionDetail.kind) || CompletionItemKind.Keyword);
        completionItem.insertText = new SnippetString(snippet);
        if (range) { completionItem.range = range; }
        if (suggestionDetail) {
            completionItem.detail = suggestionDetail.detail;
            completionItem.documentation = suggestionDetail.documentation;
        }
        completionItem.filterText = suggestion.filterText;
        completionItem.sortText = 'item' + index;
        return completionItem;
    }
    
    protected addConstraintsDocumentation(): void {
        this.addSuggestionDocumentation(':constraints', 'Constraints', 'Constraints.... you may want to stay away from those.');
    }

    protected addRequirementsDocumentation(): void {
        this.addSuggestionDocumentation(':requirements', 'Requirements', 'Required planning engine features.');
    }

    protected addIconGallery(): CompletionItem[] {
        // Object.keys(CompletionItemKind).map(key => CompletionItemKind[key]);
        return [
            new CompletionItem("Class", CompletionItemKind.Class),
            new CompletionItem("Text", CompletionItemKind.Text),
            new CompletionItem("Method", CompletionItemKind.Method),
            new CompletionItem("Function", CompletionItemKind.Function),
            new CompletionItem("Constructor", CompletionItemKind.Constructor),
            new CompletionItem("Field", CompletionItemKind.Field),
            new CompletionItem("Variable", CompletionItemKind.Variable),
            new CompletionItem("Class", CompletionItemKind.Class),
            new CompletionItem("Interface", CompletionItemKind.Interface),
            new CompletionItem("Module", CompletionItemKind.Module),
            new CompletionItem("Property", CompletionItemKind.Property),
            new CompletionItem("Unit", CompletionItemKind.Unit),
            new CompletionItem("Value", CompletionItemKind.Value),
            new CompletionItem("Enum", CompletionItemKind.Enum),
            new CompletionItem("Keyword", CompletionItemKind.Keyword),
            new CompletionItem("Snippet", CompletionItemKind.Snippet),
            new CompletionItem("Color", CompletionItemKind.Color),
            new CompletionItem("Reference", CompletionItemKind.Reference),
            new CompletionItem("File", CompletionItemKind.File),
            new CompletionItem("Folder", CompletionItemKind.Folder),
            new CompletionItem("EnumMember", CompletionItemKind.EnumMember),
            new CompletionItem("Constant", CompletionItemKind.Constant),
            new CompletionItem("Struct", CompletionItemKind.Struct),
            new CompletionItem("Event", CompletionItemKind.Event),
            new CompletionItem("Operator", CompletionItemKind.Operator),
            new CompletionItem("TypeParameter", CompletionItemKind.TypeParameter)
        ];
    }
}

export class Suggestion {
    public readonly filterText: string;
    constructor(public readonly sectionName: string, filterTextPrefix: string) {
        this.filterText = filterTextPrefix + sectionName;
    }

    static from(sectionName: string, triggerCharacter: string, filterTextPrefix: string): Suggestion | null {
        if (triggerCharacter === ':' && !sectionName.startsWith(':')) {
            return null;
        }
        else {
            return new Suggestion(sectionName, filterTextPrefix);
        }
    }
}

export class SuggestionDetails {
    
    constructor(public readonly label: string, public readonly detail: string, public readonly documentation: string | MarkdownString, public readonly kind?: CompletionItemKind) {

    }
}