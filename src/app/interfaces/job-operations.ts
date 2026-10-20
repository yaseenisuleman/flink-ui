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

// Asynchronous job operations (savepoint, stop-with-savepoint, checkpoint,
// savepoint disposal). Each POST answers with a trigger id; the matching GET
// reports IN_PROGRESS until the operation completes or fails.

export type SavepointFormat = 'CANONICAL' | 'NATIVE';
export type CheckpointType = 'CONFIGURED' | 'FULL' | 'INCREMENTAL';

export interface TriggerResponse {
  'request-id': string;
}

export interface FailureCause {
  class: string;
  'stack-trace': string;
  'serialized-throwable'?: string;
}

export interface AsyncOperationStatus<T> {
  status: { id: 'IN_PROGRESS' | 'COMPLETED' };
  operation: (T & { 'failure-cause'?: FailureCause }) | null;
}

export type SavepointOperation = AsyncOperationStatus<{ location?: string }>;
export type CheckpointOperation = AsyncOperationStatus<{ checkpointId?: number }>;
export type DisposalOperation = AsyncOperationStatus<Record<string, never>>;

/** Outcome of a finished operation, ready to show. */
export interface OperationResult {
  ok: boolean;
  /** Savepoint location, or checkpoint id as text. */
  value?: string;
  /** Root cause of a failure, one line. */
  error?: string;
}

/** A savepoint the dashboard knows about (triggered here, or found in job checkpoint history). */
export interface SavepointRecord {
  path: string;
  jobId: string;
  jobName: string;
  /** Epoch millis. */
  time: number;
  /** Triggered from this browser (kept in local storage) or found on the cluster. */
  source: 'browser' | 'cluster';
  disposed?: boolean;
}

export interface JobExecutionResult {
  status: { id: 'IN_PROGRESS' | 'COMPLETED' };
  'job-execution-result'?: {
    id: string;
    name?: string;
    'application-status': string;
    'accumulator-results': Record<string, string>;
    'net-runtime': number;
    'start-time'?: number;
    'end-time'?: number;
    'failure-cause'?: FailureCause;
  };
}

export interface JobLevelAccumulators {
  'job-accumulators': Array<{ name: string; type: string; value: string }>;
  'user-task-accumulators': Array<{ name: string; type: string; value: string }>;
}

export interface SubtaskAttempt {
  subtask: number;
  status: string;
  attempt: number;
  endpoint: string;
  'start-time': number;
  'end-time': number;
  duration: number;
  'taskmanager-id': string;
  'status-duration'?: Record<string, number>;
}

export interface SubtaskAttemptAccumulators {
  subtask: number;
  attempt: number;
  id: string;
  'user-accumulators': Array<{ name: string; type: string; value: string }>;
}

/** /taskmanagers/metrics and /jobs/metrics with ?agg=... */
export interface AggregatedMetric {
  id: string;
  min?: number;
  max?: number;
  avg?: number;
  sum?: number;
  skew?: number;
}
