'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import {createChart, ColorType, LineSeries, type IChartApi, type ISeriesApi, type UTCTimestamp, type LineData } from 'lightweight-charts';

type PricePoint = {
  time: string;
  value: number;
};

type PriceChartProps = {
  data: PricePoint[];
  height?: number;
};

const isoToUTCTimestamp = (iso: string) => Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;

export const PriceChart: React.FC<PriceChartProps> = ({ data, height = 300 }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<'Line'> | null>(null);

    const chartData: LineData[] = useMemo(() => {
        return [...data].map((p) => ({
            time: isoToUTCTimestamp(p.time),
            value: p.value,
        })).sort((a, b) => (a.time as number) - (b.time as number));
    }, [data]);

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

        const series = chart.addSeries(LineSeries, {
        color: '#3B82F6',
        lineWidth: 2,
        });

        chartRef.current = chart;
        seriesRef.current = series;

        const handleResize = () => chart.applyOptions({ width: container.clientWidth });
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, [height]);

    useEffect(() => {
        if (!seriesRef.current || !chartData.length) return;
        seriesRef.current.setData(chartData);
        chartRef.current?.timeScale().fitContent();
    }, [chartData]);

    return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};
