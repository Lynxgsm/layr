import {
  AbstractStore,
  CreateDocumentParams,
  ReadDocumentParams,
  UpdateDocumentParams,
  DeleteDocumentParams,
  FindDocumentsParams,
  CountDocumentsParams,
  Document,
  Expression,
  Path,
  Operator,
  SortDescriptor
} from '@liaison/abstract-store';
import {Component, NormalizedIdentifierDescriptor} from '@liaison/component';
import pull from 'lodash/pull';
import get from 'lodash/get';
import set from 'lodash/set';
import unset from 'lodash/unset';
import sortOn from 'sort-on';

type Collection = Document[];

type CollectionMap = {[name: string]: Collection};

export class MemoryStore extends AbstractStore {
  constructor(
    rootComponent?: typeof Component,
    options: {initialCollections?: CollectionMap} = {}
  ) {
    const {initialCollections = {}, ...otherOptions} = options;

    super(rootComponent, otherOptions);

    this._collections = initialCollections;
  }

  // === Collections ===

  _collections: CollectionMap;

  _getCollection(name: string) {
    let collection = this._collections[name];

    if (collection === undefined) {
      collection = [];
      this._collections[name] = collection;
    }

    return collection;
  }

  // === Documents ===

  async createDocument({collectionName, identifierDescriptor, document}: CreateDocumentParams) {
    const collection = this._getCollection(collectionName);

    const existingDocument = await this._readDocument({collection, identifierDescriptor});

    if (existingDocument !== undefined) {
      return false;
    }

    collection.push(document);

    return true;
  }

  async readDocument({
    collectionName,
    identifierDescriptor
  }: ReadDocumentParams): Promise<Document | undefined> {
    const collection = this._getCollection(collectionName);

    const document = await this._readDocument({collection, identifierDescriptor});

    return document;
  }

  async _readDocument({
    collection,
    identifierDescriptor
  }: {
    collection: Collection;
    identifierDescriptor: NormalizedIdentifierDescriptor;
  }): Promise<Document | undefined> {
    const [[identifierName, identifierValue]] = Object.entries(identifierDescriptor);

    const document = collection.find((document) => document[identifierName] === identifierValue);

    return document;
  }

  async updateDocument({
    collectionName,
    identifierDescriptor,
    documentPatch
  }: UpdateDocumentParams) {
    const collection = this._getCollection(collectionName);

    const existingDocument = await this._readDocument({collection, identifierDescriptor});

    if (existingDocument === undefined) {
      return false;
    }

    const {$set, $unset} = documentPatch;

    if ($set !== undefined) {
      for (const [path, value] of Object.entries($set)) {
        set(existingDocument, path, value);
      }
    }

    if ($unset !== undefined) {
      for (const [path, value] of Object.entries($unset)) {
        if (value) {
          unset(existingDocument, path);
        }
      }
    }

    return true;
  }

  async deleteDocument({collectionName, identifierDescriptor}: DeleteDocumentParams) {
    const collection = this._getCollection(collectionName);

    const document = await this._readDocument({collection, identifierDescriptor});

    if (document === undefined) {
      return false;
    }

    pull(collection, document);

    return true;
  }

  async findDocuments({
    collectionName,
    expressions,
    sort,
    skip,
    limit
  }: FindDocumentsParams): Promise<Document[]> {
    const collection = this._getCollection(collectionName);

    const documents = await this._findDocuments({collection, expressions, sort, skip, limit});

    return documents;
  }

  async _findDocuments({
    collection,
    expressions,
    sort,
    skip,
    limit
  }: {
    collection: Collection;
    expressions: Expression[];
    sort?: SortDescriptor;
    skip?: number;
    limit?: number;
  }): Promise<Document[]> {
    let documents = filterDocuments(collection, expressions);

    documents = sortDocuments(documents, sort);

    documents = skipDocuments(documents, skip);

    documents = limitDocuments(documents, limit);

    return documents;
  }

  async countDocuments({collectionName, expressions}: CountDocumentsParams) {
    const collection = this._getCollection(collectionName);

    const documents = await this._findDocuments({collection, expressions});

    return documents.length;
  }
}

function filterDocuments(documents: Document[], expressions: Expression[]) {
  if (expressions.length === 0) {
    return documents; // Optimization
  }

  return documents.filter((document) => documentIsMatchingExpressions(document, expressions));
}

function documentIsMatchingExpressions(document: Document, expressions: Expression[]) {
  for (const [path, operator, operand] of expressions) {
    const attributeValue = path !== '' ? get(document, path) : document;

    if (evaluateExpression(attributeValue, operator, operand, {path}) === false) {
      return false;
    }
  }

  return true;
}

function evaluateExpression(
  attributeValue: any,
  operator: Operator,
  operand: any,
  {path}: {path: Path}
) {
  // --- Basic operators ---

  if (operator === '$equal') {
    return attributeValue?.valueOf() === operand?.valueOf();
  }

  if (operator === '$notEqual') {
    return attributeValue?.valueOf() !== operand?.valueOf();
  }

  if (operator === '$greaterThan') {
    return attributeValue > operand;
  }

  if (operator === '$greaterThanOrEqual') {
    return attributeValue >= operand;
  }

  if (operator === '$lessThan') {
    return attributeValue < operand;
  }

  if (operator === '$lessThanOrEqual') {
    return attributeValue <= operand;
  }

  if (operator === '$any') {
    return operand.includes(attributeValue);
  }

  // --- String operators ---

  if (operator === '$includes') {
    if (typeof attributeValue !== 'string') {
      return false;
    }

    return attributeValue.includes(operand);
  }

  if (operator === '$startsWith') {
    if (typeof attributeValue !== 'string') {
      return false;
    }

    return attributeValue.startsWith(operand);
  }

  if (operator === '$endsWith') {
    if (typeof attributeValue !== 'string') {
      return false;
    }

    return attributeValue.endsWith(operand);
  }

  if (operator === '$matches') {
    if (typeof attributeValue !== 'string') {
      return false;
    }

    return operand.test(attributeValue);
  }

  // --- Array operators ---

  if (operator === '$some') {
    if (!Array.isArray(attributeValue)) {
      return false;
    }

    const subdocuments = attributeValue;
    const subexpressions = operand;

    return subdocuments.some((subdocument) =>
      documentIsMatchingExpressions(subdocument, subexpressions)
    );
  }

  if (operator === '$every') {
    if (!Array.isArray(attributeValue)) {
      return false;
    }

    const subdocuments = attributeValue;
    const subexpressions = operand;

    return subdocuments.every((subdocument) =>
      documentIsMatchingExpressions(subdocument, subexpressions)
    );
  }

  if (operator === '$length') {
    if (!Array.isArray(attributeValue)) {
      return false;
    }

    return attributeValue.length === operand;
  }

  // --- Logical operators ---

  if (operator === '$not') {
    const subexpressions = operand;

    return !documentIsMatchingExpressions(attributeValue, subexpressions);
  }

  if (operator === '$and') {
    const andSubexpressions = operand as any[];

    return andSubexpressions.every((subexpressions) =>
      documentIsMatchingExpressions(attributeValue, subexpressions)
    );
  }

  if (operator === '$or') {
    const orSubexpressions = operand as any[];

    return orSubexpressions.some((subexpressions) =>
      documentIsMatchingExpressions(attributeValue, subexpressions)
    );
  }

  if (operator === '$nor') {
    const norSubexpressions = operand as any[];

    return !norSubexpressions.some((subexpressions) =>
      documentIsMatchingExpressions(attributeValue, subexpressions)
    );
  }

  throw new Error(
    `A query contains an operator that is not supported (operator: '${operator}', path: '${path}')`
  );
}

function sortDocuments(documents: Document[], sort: SortDescriptor | undefined) {
  if (sort === undefined) {
    return documents;
  }

  const properties = Object.entries(sort).map(([name, direction]) => {
    let property = name;

    if (direction.toLowerCase() === 'desc') {
      property = `-${property}`;
    }

    return property;
  });

  return sortOn(documents, properties);
}

function skipDocuments(documents: Document[], skip: number | undefined) {
  if (skip === undefined) {
    return documents;
  }

  return documents.slice(skip);
}

function limitDocuments(documents: Document[], limit: number | undefined) {
  if (limit === undefined) {
    return documents;
  }

  return documents.slice(0, limit);
}