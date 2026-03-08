'use client';

import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Strategy } from '@/lib/lumibot/types';
import { PREDEFINED_STRATEGIES } from '@/lib/lumibot/types';

interface StrategySelectorProps {
  value: string;
  onChange: (value: string) => void;
  strategies: Strategy[];
}

export function StrategySelector({
  value,
  onChange,
  strategies,
}: StrategySelectorProps) {
  // Use predefined strategies if no strategies from API
  const displayStrategies =
    strategies.length > 0
      ? strategies
      : PREDEFINED_STRATEGIES.map((s) => ({
          name: s.id,
          class: s.name,
          description: s.description,
        }));

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select strategy" />
      </SelectTrigger>
      <SelectContent>
        {displayStrategies.map((strategy) => (
          <SelectItem key={strategy.name} value={strategy.name}>
            {strategy.class || strategy.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
