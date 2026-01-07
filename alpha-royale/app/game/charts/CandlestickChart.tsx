'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import {createChart, ColorType, CandlestickSeries, type IChartApi, type ISeriesApi, type UTCTimestamp, type CandlestickData } from 'lightweight-charts';

type PricePoint = {
  time: string;
  value: number;
};

type CandlestickChartProps = {
  data: PricePoint[];
  height?: number;
};

const isoToUTCTimestamp = (iso: string) => Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;

// Convert line data to candlestick data by grouping points into 5-minute intervals
const convertToCandlestickData = (lineData: PricePoint[]): CandlestickData[] => {
  if (lineData.length === 0) return [];
  
  const intervalMs = 5 * 60 * 1000; // 5 minutes in milliseconds
  const candles = new Map<number, { open: number; high: number; low: number; close: number; time: UTCTimestamp }>();
  
  lineData.forEach(point => {
    const timestamp = new Date(point.time).getTime();
    const intervalStart = Math.floor(timestamp / intervalMs) * intervalMs;
    const utcTime = Math.floor(intervalStart / 1000) as UTCTimestamp;
    
    if (!candles.has(intervalStart)) {
      candles.set(intervalStart, {
        time: utcTime,
        open: point.value,
        high: point.value,
        low: point.value,
        close: point.value,
      });
    } else {
      const candle = candles.get(intervalStart)!;
      candle.high = Math.max(candle.high, point.value);
      candle.low = Math.min(candle.low, point.value);
      candle.close = point.value;
    }
  });
  
  return Array.from(candles.values()).sort((a, b) => (a.time as number) - (b.time as number));
};

export const CandlestickChart: React.FC<CandlestickChartProps> = ({ data, height = 300 }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

    const candlestickData: CandlestickData[] = useMemo(() => {
        return convertToCandlestickData(data);
    }, [data]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const chart = createChart(container, {
            width: container.clientWidth,
            height: container.clientHeight,
            layout: {
                background: { type: ColorType.Solid, color: '#0a0b0d' },
                textColor: '#9CA3AF',
            },
            grid: {
                vertLines: { color: '#1e1f25' },
                horzLines: { color: '#1e1f25' },
            },
            rightPriceScale: { borderColor: '#1e1f25' },
            timeScale: { borderColor: '#1e1f25' },
        });

        const series = chart.addSeries(CandlestickSeries, {
            upColor: '#10b981',
            downColor: '#ef4444',
            borderUpColor: '#10b981',
            borderDownColor: '#ef4444',
            wickUpColor: '#10b981',
            wickDownColor: '#ef4444',
        });

        if (candlestickData.length) {
            series.setData(candlestickData);
            chart.timeScale().fitContent();
        }

        chartRef.current = chart;
        seriesRef.current = series;

        const handleResize = () => chart.applyOptions({ width: container.clientWidth });
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
            chartRef.current = null;
            seriesRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!seriesRef.current || !candlestickData.length) return;
        seriesRef.current.setData(candlestickData);
        chartRef.current?.timeScale().fitContent();
    }, [candlestickData]);

    return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};
