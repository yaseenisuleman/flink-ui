/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Flink SQL Gateway REST API (v1). The gateway is a separate service; the
// dashboard reaches it under ./sql-gateway (proxied by flink-ui's nginx).

export interface SqlGatewayInfo {
  productName: string;
  version: string;
}

export interface SqlColumn {
  name: string;
  logicalType: { type: string; nullable: boolean; [key: string]: unknown };
  comment: string | null;
}

/** +I, -U, +U, -D rows of a changelog result. */
export type SqlRowKind = 'INSERT' | 'UPDATE_BEFORE' | 'UPDATE_AFTER' | 'DELETE';

export interface SqlRow {
  kind: SqlRowKind;
  fields: unknown[];
}

export interface SqlFetchResult {
  resultType: 'NOT_READY' | 'PAYLOAD' | 'EOS';
  isQueryResult?: boolean;
  jobID?: string;
  resultKind?: 'SUCCESS' | 'SUCCESS_WITH_CONTENT';
  results?: { columns: SqlColumn[]; data: SqlRow[]; rowFormat?: string };
  nextResultUri?: string;
}
