/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

export interface CatalogEntry {
    id: number;
    label?: string;
    tooltip?: string;
	kind: CatalogEntryKind;
}

export class Collection implements CatalogEntry {

    public readonly label?: string;
    public readonly tooltip?: string;
    public readonly kind = CatalogEntryKind.Collection;

    constructor(public id: number, name: string, description: string, public domainIds: number[]) {
        this.label = name;
        this.tooltip = description;
    }
}

export class Domain implements CatalogEntry {

    public readonly label?: string;
    public readonly tooltip?: string;
    public readonly kind = CatalogEntryKind.Domain;

    constructor(public id: number, name: string, description: string) {
        this.label = name;
        this.tooltip = description;
    }
}

export class Problem implements CatalogEntry {

    public readonly label?: string;
    public readonly tooltip?: string;
    public readonly kind = CatalogEntryKind.Problem;

    constructor(public id: number, name: string, public domain_url: string, public problem_url: string) {
        this.label = name;
    }
}
export enum CatalogEntryKind { Collection, Domain, Problem }
