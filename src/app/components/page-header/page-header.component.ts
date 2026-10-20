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

import { NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Page header of the dashboard refresh: an uppercase pretitle (optionally with
 * a live dot) above the page title, actions on the right.
 *
 * Content slots: [pretitle] before the pretitle text (e.g. a back link),
 * [title] after the title (badges), and the default slot for the actions.
 */
@Component({
  selector: 'flink-page-header',
  templateUrl: './page-header.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIf]
})
export class PageHeaderComponent {
  @Input() pretitle = '';
  @Input() title = '';
  /** Shows the pulsing green dot before the pretitle (a live, running thing). */
  @Input() live = false;
}
