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

export const PriceChart: React.FC<PriceChartProps> = ({ data1, data2 = [], showData2 = false, height = 300 }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const series1Ref = useRef<ISeriesApi<'Line'> | null>(null);
    const series2Ref = useRef<ISeriesApi<'Line'> | null>(null);

    const chartData1: LineData[] = useMemo(() => {
        return [...data1].map((p) => ({
            time: isoToUTCTimestamp(p.time),
            value: p.value,
        })).sort((a, b) => (a.time as number) - (b.time as number));
    }, [data1]);

    const chartData2: LineData[] = useMemo(() => {
        return [...data2].map((p) => ({
            time: isoToUTCTimestamp(p.time),
            value: p.value,
        })).sort((a, b) => (a.time as number) - (b.time as number));
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

        chartRef.current = chart;
        series1Ref.current = series1;
        series2Ref.current = series2;

        const handleResize = () => chart.applyOptions({ width: container.clientWidth });
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, [height]);

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
