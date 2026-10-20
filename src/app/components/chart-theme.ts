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

import { registerTheme } from '@antv/g2';
import type { Theme } from '@flink-runtime-web/services';

// G2 chart themes in the refresh palette, one per dashboard theme. G2 draws on
// a canvas, so it can't read the CSS tokens; these repeat refresh/tokens.less.
// Kept out of ThemeService so G2 stays in the lazily loaded chart chunks.

const PALETTE = [
  '#066fd1',
  '#2fb344',
  '#f76707',
  '#d63939',
  '#ae3ec9',
  '#17a2b8',
  '#f59f00',
  '#4263eb',
  '#d6336c',
  '#737373'
];

const FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

registerTheme('flink-light', {
  styleSheet: {
    brandColor: PALETTE[0],
    paletteQualitative10: PALETTE,
    backgroundColor: 'transparent',
    fontFamily: FONT,
    axisLabelFillColor: '#737373',
    axisLineBorderColor: '#e6e7e9',
    axisTickLineBorderColor: '#e6e7e9',
    axisGridBorderColor: '#ededed',
    legendItemNameFillColor: '#404040',
    tooltipContainerFillColor: '#283144',
    tooltipTextFillColor: '#fff'
  }
});

registerTheme('flink-dark', {
  styleSheet: {
    brandColor: PALETTE[0],
    paletteQualitative10: PALETTE,
    backgroundColor: 'transparent',
    fontFamily: FONT,
    axisLabelFillColor: '#a3a3a3',
    axisLineBorderColor: '#333333',
    axisTickLineBorderColor: '#333333',
    axisGridBorderColor: '#333333',
    legendItemNameFillColor: '#d4d4d4',
    tooltipContainerFillColor: '#0d111a',
    tooltipTextFillColor: '#fff'
  }
});

/** Name of the registered G2 theme for a dashboard theme. */
export function chartTheme(theme: Theme): string {
  return theme === 'dark' ? 'flink-dark' : 'flink-light';
}
