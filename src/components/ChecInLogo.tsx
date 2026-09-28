import React from "react";

interface ChecInLogoProps {
  className?: string;
  size?: number;
  textColor?: string;
  markColor?: string;
  showText?: boolean;
}

export function ChecInLogo({
  className = "",
  size = 28,
  textColor = "#0E2322",
  markColor = "#0E2322",
  showText = true,
}: ChecInLogoProps) {
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 29 29"
        fill="none"
        className="shrink-0"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M23.8801 23.4753L21.0601 25.8674L16.716 21.2005L8.89202 28.1071L6.46802 25.3397L13.452 19.1836C14.34 18.3863 15.456 17.9759 16.644 17.9759C16.752 17.9759 16.86 17.9759 16.956 17.9759C18.24 18.0462 19.428 18.6208 20.2801 19.5706L23.8801 23.4636V23.4753Z"
          fill={markColor}
        />
        <path
          d="M10.38 16.2639C10.38 16.3577 10.368 16.4632 10.368 16.557C10.284 17.8234 9.70802 18.9843 8.72402 19.8168L4.74001 23.3346L2.30401 20.579L7.08002 16.3342L0 8.68891L2.83201 6.332L9.14402 13.133C9.94802 14.0125 10.38 15.0913 10.38 16.2639Z"
          fill={markColor}
        />
        <path
          d="M22.296 2.76732L15.324 8.92344C14.424 9.7208 13.32 10.1429 12.12 10.1429C12.024 10.1429 11.916 10.1312 11.808 10.1312C10.524 10.0491 9.34801 9.48628 8.496 8.52475L4.896 4.63174L7.716 2.25138L12.048 6.9183L19.872 0L22.296 2.76732Z"
          fill={markColor}
        />
        <path
          d="M28.764 19.4181L25.932 21.7868L19.632 14.974C18.828 14.0946 18.396 13.0158 18.396 11.8432C18.396 11.7494 18.396 11.6438 18.408 11.55C18.48 10.2836 19.068 9.12277 20.04 8.30195L24.036 4.77245L26.472 7.53977L21.696 11.7728L28.764 19.4181Z"
          fill={markColor}
        />
      </svg>
      {showText && (
        <span
          className="font-medium tracking-tight leading-none text-[26px]"
          style={{ color: textColor }}
        >
          ChecIN
        </span>
      )}
    </div>
  );
}
