declare module 'react-plotly.js' {
  import { FC } from 'react';
  
  interface PlotProps {
    data: any[];
    layout?: any;
    config?: any;
    onInitialized?: (figure: any, graphDiv: any) => void;
    onError?: (error: any) => void;
    [key: string]: any;
  }
  
  const Plot: FC<PlotProps>;
  export default Plot;
}
