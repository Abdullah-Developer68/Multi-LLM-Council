declare module 'react-native-markdown-display' {
  import type { ComponentType, ReactNode } from 'react';
  import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

  export interface MarkdownProps {
    children: ReactNode;
    style?: { [key: string]: StyleProp<TextStyle | ViewStyle> };
    mergeStyle?: boolean;
  }

  const Markdown: ComponentType<MarkdownProps>;
  export default Markdown;
}
