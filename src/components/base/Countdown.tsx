import { useState, useEffect } from 'react';

interface CountdownProps {
  targetDate: string;
  className?: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export default function Countdown({ targetDate, className = '' }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isReleased, setIsReleased] = useState(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = new Date(targetDate).getTime() - new Date().getTime();
      
      if (difference <= 0) {
        setIsReleased(true);
        return { days: 0, hours: 0, minutes: 0, seconds: 0 };
      }

      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60),
      };
    };

    setTimeLeft(calculateTimeLeft());

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  if (isReleased) {
    return (
      <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-500/15 text-green-400 text-xs font-semibold rounded-lg ${className}`}>
        <i className="ri-checkbox-circle-fill" />
        Đã ra mắt
      </div>
    );
  }

  const timeBlocks = [
    { value: timeLeft.days, label: 'NGÀY' },
    { value: timeLeft.hours, label: 'GIỜ' },
    { value: timeLeft.minutes, label: 'PHÚT' },
    { value: timeLeft.seconds, label: 'GIÂY' },
  ];

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {timeBlocks.map((block, index) => (
        <div key={block.label} className="flex items-center gap-1.5">
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-gradient-to-b from-red-500 to-red-600 rounded-lg shadow-lg shadow-red-500/20">
              <span className="text-white font-bold text-sm sm:text-base">
                {String(block.value).padStart(2, '0')}
              </span>
            </div>
            <span className="text-[8px] sm:text-[10px] text-white/40 font-medium mt-1">
              {block.label}
            </span>
          </div>
          {index < timeBlocks.length - 1 && (
            <span className="text-red-400 font-bold text-lg -mt-4">:</span>
          )}
        </div>
      ))}
    </div>
  );
}