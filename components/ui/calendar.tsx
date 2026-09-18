'use client';

import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface CalendarProps {
  value?: Date;
  onChange?: (date: Date) => void;
  disabledDates?: Date[];
  minDate?: Date;
  maxDate?: Date;
  className?: string;
}

const Calendar = React.forwardRef<HTMLDivElement, CalendarProps>(
  (
    {
      value = new Date(),
      onChange,
      disabledDates = [],
      minDate,
      maxDate,
      className,
    },
    ref
  ) => {
    const [currentDate, setCurrentDate] = useState(
      new Date(value.getFullYear(), value.getMonth(), 1)
    );

    const daysInMonth = (date: Date) => {
      return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    };

    const firstDayOfMonth = (date: Date) => {
      return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    };

    const isDateDisabled = (date: Date): boolean => {
      const dateStr = date.toDateString();
      const isInDisabled = disabledDates.some(
        (d) => d.toDateString() === dateStr
      );
      const isBeforeMin = minDate && date < minDate;
      const isAfterMax = maxDate && date > maxDate;

      return isInDisabled || !!isBeforeMin || !!isAfterMax;
    };

    const isDateSelected = (date: Date): boolean => {
      return date.toDateString() === value.toDateString();
    };

    const handlePrevMonth = () => {
      setCurrentDate(
        new Date(currentDate.getFullYear(), currentDate.getMonth() - 1)
      );
    };

    const handleNextMonth = () => {
      setCurrentDate(
        new Date(currentDate.getFullYear(), currentDate.getMonth() + 1)
      );
    };

    const handleSelectDate = (day: number) => {
      const selectedDate = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        day
      );
      if (!isDateDisabled(selectedDate) && onChange) {
        onChange(selectedDate);
      }
    };

    const days = [];
    const totalDays = daysInMonth(currentDate);
    const firstDay = firstDayOfMonth(currentDate);

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    // Days of the month
    for (let day = 1; day <= totalDays; day++) {
      days.push(day);
    }

    const monthName = currentDate.toLocaleString('es-ES', {
      month: 'long',
      year: 'numeric',
    });

    return (
      <div
        ref={ref}
        className={cn('w-full rounded-lg border border-input bg-white p-4', className)}
      >
        {/* Month and year header */}
        <div className="mb-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrevMonth}
            className="h-8 w-8 p-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-sm font-semibold capitalize">{monthName}</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNextMonth}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Days of week header */}
        <div className="mb-2 grid grid-cols-7 gap-1">
          {['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'].map((day) => (
            <div
              key={day}
              className="text-center text-xs font-medium text-gray-500"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar days */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, index) => {
            if (day === null) {
              return (
                <div
                  key={`empty-${index}`}
                  className="h-8 w-8"
                />
              );
            }

            const date = new Date(
              currentDate.getFullYear(),
              currentDate.getMonth(),
              day
            );
            const disabled = isDateDisabled(date);
            const selected = isDateSelected(date);

            return (
              <button
                key={day}
                onClick={() => handleSelectDate(day)}
                disabled={disabled}
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded text-sm',
                  selected
                    ? 'bg-cyan-600 text-white font-semibold'
                    : 'hover:bg-accent',
                  disabled && 'cursor-not-allowed opacity-50'
                )}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
);

Calendar.displayName = 'Calendar';

export { Calendar };
