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

/**
 * Splits SQL text into statements on ";" outside string literals, quoted
 * identifiers and comments. Statements are trimmed; empty ones (and ones that
 * are only comments) are dropped.
 */
export function splitStatements(text: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === "'" || c === '"' || c === '`') {
      // Quote: copy up to the closing quote; a doubled quote is an escaped one
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === c) {
          if (text[j + 1] === c) {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      current += text.slice(i, j + 1);
      i = j + 1;
    } else if (c === '-' && next === '-') {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? text.length : end;
      current += text.slice(i, stop);
      i = stop;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      current += text.slice(i, stop);
      i = stop;
    } else if (c === ';') {
      statements.push(current);
      current = '';
      i++;
    } else {
      current += c;
      i++;
    }
  }
  statements.push(current);
  return statements.map(statement => statement.trim()).filter(statement => !!stripComments(statement).trim());
}

function stripComments(statement: string): string {
  return statement.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}
