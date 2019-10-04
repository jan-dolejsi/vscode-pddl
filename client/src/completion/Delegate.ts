/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { CompletionItem, CompletionItemKind, MarkdownString } from 'vscode';
import { DomainInfo, TypeObjects } from '../../../common/src/DomainInfo';
import { Variable } from '../../../common/src/FileInfo';

export abstract class Delegate {

    constructor(){

    }

    createOperator(label: string, detail: string, documentation: string | MarkdownString): CompletionItem {
        return this.createCompletionItem(label, detail, documentation, CompletionItemKind.Function);
    }

    createCompletionItem(label: string, detail: string, documentation: string | MarkdownString, kind: CompletionItemKind): CompletionItem {
        let item = new CompletionItem(label, kind);
        item.detail = detail;
        item.documentation = documentation;
        return item;
    }

    static toNamesCsv(variables: Variable[]): string {
        return variables
            .map(var1 => var1.name)
            .join(',');
    }

    static toTypeLessNamesCsv(variables: Variable[]): string {
        return variables
            .map(var1 => var1.declaredNameWithoutTypes)
            .join(',');
    }

    getObjects(allTypeObjects: TypeObjects[], types: string[]): string[] {
        return allTypeObjects
            .filter(typeObjects => types.includes(typeObjects.type))
            .map(typeObjects => typeObjects.getObjects())
            .reduce((x, y) => x.concat(y), []); // flat map
    }

    getTypesInvolved(variables: Variable[], domainFile: DomainInfo): string[] {
        var typesDirectlyInvolved = variables.map(p => p.parameters)
            .reduce((x, y) => x.concat(y), []) // flat map
            .map(p => p.type)
            .filter((v, i, a) => a.indexOf(v) === i); // distinct

        var typesInheriting = typesDirectlyInvolved
            .map(type1 => domainFile.getTypesInheritingFrom(type1))
            .reduce((x, y) => x.concat(y), []);

        return typesInheriting.concat(typesDirectlyInvolved);
    }

    getSymmetricPredicates(domainFile: DomainInfo): Variable[] {
        return domainFile.getPredicates().filter(this.isSymmetric);
    }

    getSymmetricFunctions(domainFile: DomainInfo): Variable[] {
        return domainFile.getFunctions().filter(this.isSymmetric);
    }

    isSymmetric(variable: Variable): boolean {
        // the predicate has exactly 2 parameters
        return variable.parameters.length === 2
            // and the parameters are of the same type
            && variable.parameters[0].type === variable.parameters[1].type;
    }

}