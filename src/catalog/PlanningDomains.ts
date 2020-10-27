/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { CatalogEntry, Collection, Domain, Problem } from './CatalogEntry';
import { getJson } from '../httpUtils';

/* eslint-disable @typescript-eslint/no-explicit-any */

export class PlanningDomains {

    public static readonly AUTHORITY = "api.planning.domains";
    public static readonly URL = "https://api.planning.domains/json/classical/";

    private parseCollection(collectionJson: any): Collection {
        return new Collection(
            collectionJson["collection_id"],
            collectionJson["collection_name"],
            collectionJson["description"],
            JSON.parse(collectionJson["domain_set"])
        );
    }

    async getCollections(): Promise<CatalogEntry[]> {
        const url = PlanningDomains.URL + "collections";
        const jsonOutput = await getJsonResult(url);
        return jsonOutput
            .map((collectionJson: any) => this.parseCollection(collectionJson));
    }

    private parseDomain(domainJson: any): Domain {
        return new Domain(
            domainJson["domain_id"],
            domainJson["domain_name"],
            domainJson["description"]
        );
    }

    async getDomains(collection: Collection): Promise<CatalogEntry[]> {
        const url = PlanningDomains.URL + "domains/" + collection.id;
        const jsonOutput = await getJsonResult(url);
        return jsonOutput
            .map((domainJson: any) => this.parseDomain(domainJson))
            .sort(compareCatalogEntry);
    }

    private parseProblem(problemJson: any): Problem {
        return new Problem(
            problemJson["problem_id"],
            problemJson["problem"],
            problemJson["domain_url"],
            problemJson["problem_url"]
        );
    }

    async getProblems(domain: Domain): Promise<CatalogEntry[]> {
        const url = PlanningDomains.URL + "problems/" + domain.id;
        const jsonOutput = await getJsonResult(url);
        return jsonOutput
            .map((problemJson: any) => this.parseProblem(problemJson))
            .sort(compareCatalogEntry);
    }

}

async function getJsonResult(url: string): Promise<any> {
    const response = await getJson(url);
    checkResponseForError(response);
    return response["result"];
}

export function checkResponseForError(response: any): void {
    if (response["error"]) {
        throw new Error(response["message"]);
    }
}

function compareCatalogEntry(a: CatalogEntry, b: CatalogEntry): number {
    if (a.label && b.label && a.label < b.label) {
        return -1;
    } else if (a.label && b.label && a.label > b.label) {
        return 1;
    }
    else {
        return 0;
    }
}
