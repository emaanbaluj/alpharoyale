'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import {createChart, ColorType, LineSeries, type IChartApi, type ISeriesApi, type UTCTimestamp, type LineData } from 'lightweight-charts';

type PricePoint = {
  time: string;
  value: number;
};

type PriceChartProps = {
  data1: PricePoint[];
  data2?: PricePoint[];
  showData2?: boolean;
  height?: number;
};

const isoToUTCTimestamp = (iso: string) => Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;

const deduplicateData = (data: LineData[]): LineData[] => {
  const map = new Map<number, number>();
  data.forEach(point => {
    map.set(point.time as number, point.value);
  });
  return Array.from(map.entries()).map(([time, value]) => ({ time: time as UTCTimestamp, value })).sort((a, b) => (a.time as number) - (b.time as number));
};

export const PriceChart: React.FC<PriceChartProps> = ({ data1, data2 = [], showData2 = false, height = 300 }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const series1Ref = useRef<ISeriesApi<'Line'> | null>(null);
    const series2Ref = useRef<ISeriesApi<'Line'> | null>(null);

    const chartData1: LineData[] = useMemo(() => {
        const mapped = data1.map((p) => ({
            time: isoToUTCTimestamp(p.time),
            value: p.value,
        }));
        return deduplicateData(mapped);
    }, [data1]);

    const chartData2: LineData[] = useMemo(() => {
        const mapped = data2.map((p) => ({
            time: isoToUTCTimestamp(p.time),
            value: p.value,
        }));
        return deduplicateData(mapped);
    }, [data2]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const chart = createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: {
            background: { type: ColorType.Solid, color: '#111827' },
            textColor: '#9CA3AF',
        },
        grid: {
            vertLines: { color: '#374151' },
            horzLines: { color: '#374151' },
        },
        rightPriceScale: { borderColor: '#374151' },
        timeScale: { borderColor: '#374151' },
        });

        const series1 = chart.addSeries(LineSeries, {
            color: '#3B82F6',
            lineWidth: 2,
        });

        const series2 = chart.addSeries(LineSeries, {
            color: '#10B981',
            lineWidth: 2,
        });

        if (chartData1.length) {
            series1.setData(chartData1);
            chart.timeScale().fitContent();
        }

        if (showData2 && chartData2.length) {
            series2.setData(chartData2);
        }

        chartRef.current = chart;
        series1Ref.current = series1;
        series2Ref.current = series2;

        const handleResize = () => chart.applyOptions({ width: container.clientWidth });
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
            chartRef.current = null;
            series1Ref.current = null;
            series2Ref.current = null;
        };
    }, []);

    useEffect(() => {
        if (!series1Ref.current || !chartData1.length) return;
        series1Ref.current.setData(chartData1);
        chartRef.current?.timeScale().fitContent();
    }, [chartData1]);

    useEffect(() => {
        if (!series2Ref.current) return;
        
        if (showData2 && chartData2.length) {
            series2Ref.current.setData(chartData2);
        } else {
            series2Ref.current.setData([]);
        }
    }, [chartData2, showData2]);

    return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};
