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

import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild
} from '@angular/core';
import { Subject } from 'rxjs';
import { skip, takeUntil } from 'rxjs/operators';

import { Chart } from '@antv/g2';
import * as G2 from '@antv/g2';
import { chartTheme } from '@flink-runtime-web/components/chart-theme';
import { ThemeService } from '@flink-runtime-web/services';

export interface SparklinePoint {
  time: number;
  value: number;
}

/**
 * Small trend chart for stat cards: an area under a smooth line, no axes,
 * with a tooltip. The SeaweedFS dashboard's card charts, drawn with G2.
 */
@Component({
  selector: 'flink-sparkline',
  template: '<div #chart class="sparkline"></div>',
  styles: [':host { display: block; } .sparkline { height: 100%; }'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SparklineComponent implements AfterViewInit, OnChanges, OnDestroy {
  private readonly themeService = inject(ThemeService);
  private readonly destroy$ = new Subject<void>();
  private chart?: Chart;

  @Input() data: SparklinePoint[] = [];
  @Input() color = '#066fd1';
  @Input() height = 56;
  /** Formats values in the tooltip. */
  @Input() format: (value: number) => string = value => String(value);
  /** Lowest value of the y scale; leave undefined to fit the data. */
  @Input() min?: number;
  @Input() max?: number;

  @ViewChild('chart', { static: true }) private readonly element: ElementRef<HTMLElement>;

  ngAfterViewInit(): void {
    const chart = new G2.Chart({
      container: this.element.nativeElement,
      height: this.height,
      autoFit: true,
      padding: [4, 0, 0, 0],
      theme: chartTheme(this.themeService.theme)
    });
    chart.data(this.data);
    chart.scale({
      time: { type: 'time' },
      value: { min: this.min, max: this.max, nice: this.min === undefined && this.max === undefined }
    });
    chart.axis(false);
    chart.legend(false);
    chart.tooltip({
      showCrosshairs: true,
      showTitle: true,
      title: (_: string, datum: { [key: string]: unknown }) => new Date(Number(datum.time)).toLocaleTimeString()
    });
    chart.area().position('time*value').shape('smooth').color(this.color).style({ fillOpacity: 0.14 }).tooltip(false);
    chart
      .line()
      .position('time*value')
      .shape('smooth')
      .color(this.color)
      .size(2)
      .tooltip('value', value => ({ name: 'value', value: this.format(value) }));
    chart.animate(false);
    chart.render();
    this.chart = chart;
    this.themeService.theme$.pipe(skip(1), takeUntil(this.destroy$)).subscribe(theme => {
      chart.theme(chartTheme(theme));
      chart.render(true);
    });
  }

  ngOnChanges(): void {
    this.chart?.changeData(this.data);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.chart?.destroy();
  }
}
