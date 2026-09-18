declare module 'lucide-react' {
  import * as React from 'react';

  interface IconProps extends React.SVGAttributes<SVGElement> {
    size?: string | number;
    absoluteStrokeWidth?: boolean;
  }

  export const ChevronLeft: React.ForwardRefExoticComponent<IconProps & React.RefAttributes<SVGSVGElement>>;
  export const ChevronRight: React.ForwardRefExoticComponent<IconProps & React.RefAttributes<SVGSVGElement>>;
}
