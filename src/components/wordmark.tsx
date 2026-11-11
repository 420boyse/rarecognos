type WordmarkProps = {
  className?: string;
};

export function EyeMark({ className }: WordmarkProps) {
  return (
    <img
      className={className}
      src="/brand/eye-mark.svg"
      width={65}
      height={32}
      alt=""
    />
  );
}

export function Wordmark({ className }: WordmarkProps) {
  return (
    <img
      className={`block h-auto w-32 md:w-36 ${className ?? ""}`}
      src="/brand/wordmark-white.svg"
      width={302}
      height={54}
      alt="RareCognos"
    />
  );
}
