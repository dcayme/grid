import React, {
  useRef,
  useCallback,
  useState,
  useMemo,
  forwardRef,
  useImperativeHandle,
  useReducer,
  memo,
  useEffect,
  Key,
} from "react";
import { Stage, Layer, Group, Line } from "react-konva/lib/ReactKonvaCore";
import {
  getRowStartIndexForOffset,
  getRowStopIndexForStartIndex,
  getColumnStartIndexForOffset,
  getColumnStopIndexForStartIndex,
  itemKey,
  getRowOffset,
  getColumnOffset,
  getColumnWidth,
  getRowHeight,
  getEstimatedTotalHeight,
  getEstimatedTotalWidth,
  getBoundedCells,
  cellIdentifier,
  throttle,
  getOffsetForColumnAndAlignment,
  getOffsetForRowAndAlignment,
  requestTimeout,
  cancelTimeout,
  TimeoutID,
  Align,
} from "./helpers";
import { ShapeConfig } from "konva/types/Shape";
import { CellRenderer as defaultItemRenderer } from "./Cell";
import { CellRenderer as defaultOverlayRenderer } from "./CellOverlay";
import Selection from "./Selection";
import FillHandle from "./FillHandle";
import GridLine from "./GridLine";
import { createCanvasBox, createHTMLBox } from "./utils";
import invariant from "tiny-invariant";
import { StageConfig } from "konva/types/Stage";
import { Direction } from "./types";

export interface GridProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onScroll"> {
  /**
   * Width of the grid
   */
  width?: number;
  /**
   * Height of the grid
   */
  height?: number;
  /**
   * No of columns in the grid
   */
  columnCount: number;
  /**
   * No of rows in the grid
   */
  rowCount: number;
  /**
   * Should return height of a row at an index
   */
  rowHeight?: ItemSizer;
  /**
   * Should return width of a column at an index
   */
  columnWidth?: ItemSizer;
  /**
   * Size of the scrollbar. Default is 13
   */
  scrollbarSize?: number;
  /**
   * Helps in lazy grid width calculation
   */
  estimatedColumnWidth?: number;
  /**
   * Helps in lazy grid height calculation
   */
  estimatedRowHeight?: number;
  /**
   * Called when user scrolls the grid
   */
  onScroll?: ({ scrollLeft, scrollTop }: ScrollCoords) => void;
  /**
   * Called immediately on scroll
   */
  onImmediateScroll?: ({ scrollLeft, scrollTop }: ScrollCoords) => void;
  /**
   * Show scrollbars on the left and right of the grid
   */
  showScrollbar?: boolean;
  /**
   * Currently active cell
   */
  activeCell?: CellInterface | null;
  /**
   * Background of selection
   */
  selectionBackgroundColor?: string;
  /**
   * Border color of selected area
   */
  selectionBorderColor?: string;
  /**
   * Stroke width of the selection
   */
  selectionStrokeWidth?: number;
  /**
   * Active Cell Stroke width
   */
  activeCellStrokeWidth?: number;
  /**
   * Array of selected cell areas
   */
  selections?: SelectionArea[];
  /**
   * Fill selection
   */
  fillSelection?: SelectionArea | null;
  /**
   * Array of merged cells
   */
  mergedCells?: AreaProps[];
  /**
   * Number of frozen rows
   */
  frozenRows?: number;
  /**
   * Number of frozen columns
   */
  frozenColumns?: number;
  /**
   * Snap to row and column when scrolling
   */
  snap?: boolean;
  /**
   * Show shadow as you scroll for frozen rows and columns
   */
  showFrozenShadow?: boolean;
  /**
   * Shadow settings
   */
  shadowSettings?: ShapeConfig;
  /**
   * Scroll throttle wait timeout
   */
  scrollThrottleTimeout?: number;
  /**
   * Cell styles for border
   */
  borderStyles?: StylingProps;
  /**
   * Extend certains to coords
   */
  cellAreas?: CellRangeArea[];
  /**
   * Cell renderer. Must be a Konva Component eg: Group, Rect etc
   */
  itemRenderer?: (props: RendererProps) => React.ReactNode;
  /**
   * Render custom overlays like stroke on top of cell
   */
  overlayRenderer?: (props: RendererProps) => React.ReactNode;
  /**
   * Allow users to customize selected cells design
   */
  selectionRenderer?: (props: SelectionProps) => React.ReactNode;
  /**
   * Bind to fill handle
   */
  fillHandleProps?: Record<string, (e: any) => void>;
  /**
   * Fired when scroll viewport changes
   */
  onViewChange?: (view: ViewPortProps) => void;
  /**
   * Called right before a row is being rendered.
   * Will be called for frozen cells and merged cells
   */
  onBeforeRenderRow?: (rowIndex: number) => void;
  /**
   * Custom grid overlays
   */
  children?: (props: ScrollCoords) => React.ReactNode;
  /**
   * Allows users to Wrap stage children in Top level Context
   */
  wrapper?: (children: React.ReactNode) => React.ReactNode;
  /**
   * Props that can be injected to Konva stage
   */
  stageProps?: Omit<StageConfig, "container">;
  /**
   * Show fillhandle
   */
  showFillHandle?: boolean;
  /**
   * Overscan row and columns
   */
  overscanCount?: number;
  /**
   * Border color of fill handle
   */
  fillhandleBorderColor?: string;
  /**
   * Show grid lines.
   * Useful for spreadsheets
   */
  showGridLines?: boolean;
  /**
   * Customize grid line color
   */
  gridLineColor?: string;
  /**
   * Width of the grid line
   */
  gridLineWidth?: number;
  /**
   * Gridline component
   */
  gridLineRenderer?: (props: ShapeConfig) => React.ReactNode;
  /**
   * Shadow stroke color
   */
  shadowStroke?: string;
  /**
   * Draw overlay for each cell.
   * Can be used to apply stroke or draw on top of a cell
   */
  enableCellOverlay?: boolean;
  /**
   * Check if its hidden row
   */
  isHiddenRow?: (rowIndex: number) => boolean;
  /**
   * Check if its a hidden column. Skip rendering hidden
   */
  isHiddenColumn?: (columnIndex: number) => boolean;
  /**
   * Scale
   */
  scale?: number;
}

export interface CellRangeArea extends CellInterface {
  toColumnIndex: number;
}

export type RefAttribute = {
  ref?: React.Ref<GridRef>;
};

export type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;
export interface SelectionProps extends ShapeConfig {
  fillHandleProps?: Record<string, (e: any) => void>;
}

export type ScrollCoords = {
  scrollTop: number;
  scrollLeft: number;
};

export type OptionalScrollCoords = {
  scrollTop?: number;
  scrollLeft?: number;
};

export interface ScrollState extends ScrollCoords {
  isScrolling: boolean;
  verticalScrollDirection: Direction;
  horizontalScrollDirection: Direction;
}

export type RenderComponent = React.FC<RendererProps>;
export interface CellPosition
  extends Pick<ShapeConfig, "x" | "y" | "width" | "height"> {}
export interface RendererProps
  extends CellInterface,
    CellPosition,
    Omit<ShapeConfig, "scale"> {
  key: Key;
  isMergedCell?: boolean;
  isOverlay?: boolean;
}

export type ItemSizer = (index: number) => number;

export interface SelectionArea extends AreaStyle {
  bounds: AreaProps;
  inProgress?: boolean;
  /**
   * When user drags the fill handle
   */
  isFilling?: boolean;
}
export interface AreaProps {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface CellInterface {
  rowIndex: number;
  columnIndex: number;
}

export interface OptionalCellInterface {
  rowIndex?: number;
  columnIndex?: number;
}

export interface ViewPortProps {
  rowStartIndex: number;
  rowStopIndex: number;
  columnStartIndex: number;
  columnStopIndex: number;
}

export interface InstanceInterface {
  columnMetadataMap: CellMetaDataMap;
  rowMetadataMap: CellMetaDataMap;
  lastMeasuredColumnIndex: number;
  lastMeasuredRowIndex: number;
  estimatedRowHeight: number;
  estimatedColumnWidth: number;
  recalcColumnIndices: number[];
  recalcRowIndices: number[];
}

export type CellMetaDataMap = Record<number, CellMetaData>;
export type CellMetaData = {
  offset: number;
  size: number;
};

export interface SnapRowProps {
  rowStartIndex: number;
  rowCount: number;
  deltaY: number;
  frozenRows: number;
}

export interface SnapColumnProps {
  columnStartIndex: number;
  columnCount: number;
  deltaX: number;
  frozenColumns: number;
}

export interface PosXY {
  x?: number;
  y?: number;
}

export interface PosXYRequired {
  x: number;
  y: number;
}

export type GridRef = {
  scrollTo: (scrollPosition: ScrollCoords) => void;
  scrollBy: (pos: PosXY) => void;
  stage: Stage | null;
  container: HTMLDivElement | null;
  resetAfterIndices: (
    coords: OptionalCellInterface,
    shouldForceUpdate?: boolean
  ) => void;
  getScrollPosition: () => ScrollCoords;
  isMergedCell: (coords: CellInterface) => boolean;
  getCellBounds: (coords: CellInterface) => AreaProps;
  getCellCoordsFromOffset: (x: number, y: number) => CellInterface | null;
  getCellOffsetFromCoords: (coords: CellInterface) => CellPosition;
  getActualCellCoords: (coords: CellInterface) => CellInterface;
  scrollToItem: (coords: OptionalCellInterface, align?: Align) => void;
  focus: () => void;
  resizeColumns: (indices: number[]) => void;
  resizeRows: (indices: number[]) => void;
  getViewPort: () => ViewPortProps;
  getRelativePositionFromOffset: (x: number, y: number) => PosXYRequired | null;
  scrollToTop: () => void;
  getDimensions: () => {
    containerWidth: number;
    containerHeight: number;
    estimatedTotalWidth: number;
    estimatedTotalHeight: number;
  };
};

export type MergedCellMap = Map<string, AreaProps>;

export type StylingProps = AreaStyle[];
export interface AreaStyle {
  bounds: AreaProps;
  style?: ShapeConfig;
}

const DEFAULT_ESTIMATED_ITEM_SIZE = 50;
const defaultShadowSettings: ShapeConfig = {
  strokeWidth: 1,
};
const defaultRowHeight = () => 20;
const defaultColumnWidth = () => 60;
const defaultSelectionRenderer = (props: SelectionProps) => {
  return <Selection {...props} />;
};
const defaultGridLineRenderer = (props: ShapeConfig) => {
  return <GridLine {...props} />;
};
export const RESET_SCROLL_EVENTS_DEBOUNCE_INTERVAL = 150;
/* Placeholder for empty array -> Prevents re-render */
const EMPTY_ARRAY: any = [];

/**
 * Grid component using React Konva
 * @param props
 */
const Grid: React.FC<GridProps & RefAttribute> = memo(
  forwardRef<GridRef, GridProps>((props, forwardedRef) => {
    const {
      width: containerWidth = 800,
      height: containerHeight = 600,
      estimatedColumnWidth,
      estimatedRowHeight,
      rowHeight = defaultRowHeight,
      columnWidth = defaultColumnWidth,
      rowCount = 0,
      columnCount = 0,
      scrollbarSize = 13,
      onScroll,
      onImmediateScroll,
      showScrollbar = true,
      selectionBackgroundColor = "rgb(14, 101, 235, 0.1)",
      selectionBorderColor = "#1a73e8",
      selectionStrokeWidth = 1,
      activeCellStrokeWidth = 2,
      activeCell,
      selections = EMPTY_ARRAY as SelectionArea[],
      frozenRows = 0,
      frozenColumns = 0,
      itemRenderer = defaultItemRenderer,
      enableCellOverlay = false,
      overlayRenderer = defaultOverlayRenderer,
      mergedCells = EMPTY_ARRAY as AreaProps[],
      snap = false,
      scrollThrottleTimeout = 100,
      onViewChange,
      selectionRenderer = defaultSelectionRenderer,
      onBeforeRenderRow,
      showFrozenShadow = false,
      shadowSettings = defaultShadowSettings,
      borderStyles = EMPTY_ARRAY as StylingProps,
      children,
      stageProps,
      wrapper = (children: React.ReactNode): React.ReactNode => children,
      cellAreas = EMPTY_ARRAY,
      showFillHandle = true,
      fillSelection,
      overscanCount = 1,
      fillHandleProps,
      fillhandleBorderColor = "white",
      showGridLines = false,
      gridLineColor = "#E3E2E2",
      gridLineWidth = 1,
      gridLineRenderer = defaultGridLineRenderer,
      isHiddenRow,
      isHiddenColumn,
      scale = 1,
      ...rest
    } = props;

    invariant(
      !(children && typeof children !== "function"),
      "Children should be a function"
    );

    /* Expose some methods in ref */
    useImperativeHandle(forwardedRef, () => {
      return {
        scrollTo,
        scrollBy,
        scrollToItem,
        stage: stageRef.current,
        container: containerRef.current,
        resetAfterIndices,
        getScrollPosition,
        isMergedCell,
        getCellBounds,
        getCellCoordsFromOffset,
        getCellOffsetFromCoords,
        getActualCellCoords,
        focus: focusContainer,
        resizeColumns,
        resizeRows,
        getViewPort,
        getRelativePositionFromOffset,
        scrollToTop,
        getDimensions,
      };
    });

    const instanceProps = useRef<InstanceInterface>({
      columnMetadataMap: {},
      rowMetadataMap: {},
      lastMeasuredColumnIndex: -1,
      lastMeasuredRowIndex: -1,
      estimatedColumnWidth: estimatedColumnWidth || DEFAULT_ESTIMATED_ITEM_SIZE,
      estimatedRowHeight: estimatedRowHeight || DEFAULT_ESTIMATED_ITEM_SIZE,
      recalcColumnIndices: [],
      recalcRowIndices: [],
    });
    const stageRef = useRef<Stage | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const verticalScrollRef = useRef<HTMLDivElement>(null);
    const wheelingRef = useRef<number | null>(null);
    const horizontalScrollRef = useRef<HTMLDivElement>(null);
    const scrollerRef = useRef(null);
    const [_, forceRender] = useReducer((s) => s + 1, 0);
    const [scrollState, setScrollState] = useState<ScrollState>({
      scrollTop: 0,
      scrollLeft: 0,
      isScrolling: false,
      verticalScrollDirection: Direction.Down,
      horizontalScrollDirection: Direction.Right,
    });
    const {
      scrollTop,
      scrollLeft,
      isScrolling,
      verticalScrollDirection,
      horizontalScrollDirection,
    } = scrollState;
    const isMounted = useRef(false);

    /* Focus container */
    const focusContainer = useCallback(() => {
      return containerRef.current?.focus();
    }, []);

    /**
     * onScroll callback
     */
    useEffect(() => {
      if (!isMounted.current) return;
      onScroll?.({ scrollTop, scrollLeft });
    }, [scrollTop, scrollLeft]);

    /**
     * Handle mouse wheeel
     */
    useEffect(() => {
      containerRef.current?.addEventListener("wheel", handleWheel, {
        passive: false,
      });
      isMounted.current = true;
      return () => {
        containerRef.current?.removeEventListener("wheel", handleWheel);
      };
    }, []);

    /**
     * Imperatively get the current scroll position
     */
    const getScrollPosition = useCallback(() => {
      return {
        scrollTop,
        scrollLeft,
      };
    }, [scrollTop, scrollLeft]);

    /* Redraw grid imperatively */
    const resetAfterIndices = useCallback(
      (
        { columnIndex, rowIndex }: OptionalCellInterface,
        shouldForceUpdate: boolean = true
      ) => {
        if (typeof columnIndex === "number") {
          instanceProps.current.recalcColumnIndices = [];
          instanceProps.current.lastMeasuredColumnIndex = Math.min(
            instanceProps.current.lastMeasuredColumnIndex,
            columnIndex - 1
          );
        }
        if (typeof rowIndex === "number") {
          instanceProps.current.recalcRowIndices = [];
          instanceProps.current.lastMeasuredRowIndex = Math.min(
            instanceProps.current.lastMeasuredRowIndex,
            rowIndex - 1
          );
        }
        if (shouldForceUpdate) forceRender();
      },
      []
    );

    /**
     * Create a map of merged cells
     * [rowIndex, columnindex] => [parentRowIndex, parentColumnIndex]
     */
    const mergedCellMap = useMemo((): MergedCellMap => {
      const mergedCellMap = new Map();
      for (let i = 0; i < mergedCells.length; i++) {
        const bounds = mergedCells[i];
        const { top, left } = bounds;
        for (const cell of getBoundedCells(bounds)) {
          mergedCellMap.set(cell, bounds);
        }
      }
      return mergedCellMap;
    }, [mergedCells]);

    /* Check if a cell is part of a merged cell */
    const isMergedCell = useCallback(
      ({ rowIndex, columnIndex }: CellInterface) => {
        return mergedCellMap.has(cellIdentifier(rowIndex, columnIndex));
      },
      [mergedCells]
    );

    /* Get top, left bounds of a cell */
    const getCellBounds = useCallback(
      ({ rowIndex, columnIndex }: CellInterface): AreaProps => {
        const isMerged = isMergedCell({ rowIndex, columnIndex });
        if (isMerged)
          return mergedCellMap.get(
            cellIdentifier(rowIndex, columnIndex)
          ) as AreaProps;
        return {
          top: rowIndex,
          left: columnIndex,
          right: columnIndex,
          bottom: rowIndex,
        } as AreaProps;
      },
      [mergedCellMap]
    );

    /* Get top, left bounds of a cell */
    const getActualCellCoords = useCallback(
      ({ rowIndex, columnIndex }: CellInterface): CellInterface => {
        const isMerged = isMergedCell({ rowIndex, columnIndex });
        if (isMerged) {
          const cell = mergedCellMap.get(
            cellIdentifier(rowIndex, columnIndex)
          ) as AreaProps;
          return {
            rowIndex: cell?.top,
            columnIndex: cell?.left,
          };
        }
        return {
          rowIndex,
          columnIndex,
        };
      },
      [mergedCellMap]
    );

    const getVerticalRangeToRender = () => {
      const startIndex = getRowStartIndexForOffset({
        rowHeight,
        columnWidth,
        rowCount,
        columnCount,
        instanceProps: instanceProps.current,
        offset: scrollTop,
        scale,
      });
      const stopIndex = getRowStopIndexForStartIndex({
        startIndex,
        rowCount,
        rowHeight,
        columnWidth,
        scrollTop,
        containerHeight,
        instanceProps: instanceProps.current,
        scale,
      });

      // Overscan by one item in each direction so that tab/focus works.
      // If there isn't at least one extra item, tab loops back around.
      const overscanBackward =
        !isScrolling || verticalScrollDirection === Direction.Up
          ? Math.max(1, overscanCount)
          : 1;
      const overscanForward =
        !isScrolling || verticalScrollDirection === Direction.Down
          ? Math.max(1, overscanCount)
          : 1;

      return [
        Math.max(0, startIndex - overscanBackward),
        Math.max(0, Math.min(rowCount - 1, stopIndex + overscanForward)),
        startIndex,
        stopIndex,
      ];
    };

    const getHorizontalRangeToRender = () => {
      const startIndex = getColumnStartIndexForOffset({
        rowHeight,
        columnWidth,
        rowCount,
        columnCount,
        instanceProps: instanceProps.current,
        offset: scrollLeft,
        scale,
      });

      const stopIndex = getColumnStopIndexForStartIndex({
        startIndex,
        columnCount,
        rowHeight,
        columnWidth,
        scrollLeft,
        containerWidth,
        instanceProps: instanceProps.current,
        scale,
      });

      // Overscan by one item in each direction so that tab/focus works.
      // If there isn't at least one extra item, tab loops back around.
      const overscanBackward =
        !isScrolling || horizontalScrollDirection === Direction.Left
          ? Math.max(1, overscanCount)
          : 1;
      const overscanForward =
        !isScrolling || horizontalScrollDirection === Direction.Right
          ? Math.max(1, overscanCount)
          : 1;

      return [
        Math.max(0, startIndex - overscanBackward),
        Math.max(0, Math.min(columnCount - 1, stopIndex + overscanForward)),
        startIndex,
        stopIndex,
      ];
    };

    const [rowStartIndex, rowStopIndex] = getVerticalRangeToRender();
    const [columnStartIndex, columnStopIndex] = getHorizontalRangeToRender();
    const estimatedTotalHeight = getEstimatedTotalHeight(
      rowCount,
      instanceProps.current
    );
    const estimatedTotalWidth = getEstimatedTotalWidth(
      columnCount,
      instanceProps.current
    );

    /* Method to get dimensions of the grid */
    const getDimensions = useCallback(() => {
      return {
        containerWidth,
        containerHeight,
        estimatedTotalWidth,
        estimatedTotalHeight,
      };
    }, [
      containerWidth,
      containerHeight,
      estimatedTotalWidth,
      estimatedTotalHeight,
    ]);

    /**
     * Snaps vertical scrollbar to the next/prev visible row
     */
    const snapToRowFn = useCallback(
      ({ rowStartIndex, rowCount, deltaY, frozenRows }: SnapRowProps) => {
        if (!verticalScrollRef.current) return;
        if (deltaY !== 0) {
          const nextRowIndex =
            deltaY < 0
              ? // User is scrolling up
                Math.max(0, rowStartIndex)
              : Math.min(rowStartIndex + frozenRows, rowCount - 1);
          /* TODO: Fix bug when frozenRowHeight > minRow height, which causes rowStartIndex to be 1 even after a scroll */
          const rowHeight = getRowHeight(nextRowIndex, instanceProps.current);
          verticalScrollRef.current.scrollTop +=
            (deltaY < 0 ? -1 : 1) * rowHeight;
        }
      },
      []
    );

    /**
     * Snaps horizontal scrollbar to the next/prev visible column
     */
    const snapToColumnFn = useCallback(
      ({
        columnStartIndex,
        columnCount,
        deltaX,
        frozenColumns,
      }: SnapColumnProps) => {
        if (!horizontalScrollRef.current) return;
        if (deltaX !== 0) {
          const nextColumnIndex =
            deltaX < 0
              ? Math.max(0, columnStartIndex)
              : Math.min(columnStartIndex + frozenColumns, columnCount - 1);
          const columnWidth = getColumnWidth(
            nextColumnIndex,
            instanceProps.current
          );
          horizontalScrollRef.current.scrollLeft +=
            (deltaX < 0 ? -1 : 1) * columnWidth;
        }
      },
      []
    );
    const snapToRowThrottler = useRef(
      throttle(snapToRowFn, scrollThrottleTimeout)
    );
    const snapToColumnThrottler = useRef(
      throttle(snapToColumnFn, scrollThrottleTimeout)
    );

    /* Find frozen column boundary */
    const frozenColumnWidth = getColumnOffset({
      index: frozenColumns,
      rowHeight,
      columnWidth,
      instanceProps: instanceProps.current,
      scale,
    });
    const frozenRowHeight = getRowOffset({
      index: frozenRows,
      rowHeight,
      columnWidth,
      instanceProps: instanceProps.current,
      scale,
    });
    const isWithinFrozenColumnBoundary = useCallback(
      (x: number) => {
        return frozenColumns > 0 && x < frozenColumnWidth;
      },
      [frozenColumns, frozenColumnWidth]
    );

    /* Find frozen row boundary */
    const isWithinFrozenRowBoundary = useCallback(
      (y: number) => {
        return frozenRows > 0 && y < frozenRowHeight;
      },
      [frozenRows, frozenRowHeight]
    );

    /**
     * Get relative mouse position
     */
    const getRelativePositionFromOffset = useCallback(
      (left: number, top: number): PosXYRequired | null => {
        invariant(
          typeof left === "number" && typeof top === "number",
          "Top and left should be a number"
        );
        if (!stageRef.current) return null;
        const stage = stageRef.current.getStage();
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          left = left - rect.x;
          top = top - rect.y;
        }
        const { x, y } = stage
          .getAbsoluteTransform()
          .copy()
          .invert()
          .point({ x: left, y: top });

        return { x, y };
      },
      []
    );

    /**
     * Get cell cordinates from current mouse x/y positions
     */
    const getCellCoordsFromOffset = useCallback(
      (left: number, top: number): CellInterface | null => {
        const pos = getRelativePositionFromOffset(left, top);
        if (!pos) return null;
        const { x, y } = pos;
        const rowIndex = getRowStartIndexForOffset({
          rowHeight,
          columnWidth,
          rowCount,
          columnCount,
          instanceProps: instanceProps.current,
          offset: isWithinFrozenRowBoundary(y) ? y : y + scrollTop,
          scale,
        });
        const columnIndex = getColumnStartIndexForOffset({
          rowHeight,
          columnWidth,
          rowCount,
          columnCount,
          instanceProps: instanceProps.current,
          offset: isWithinFrozenColumnBoundary(x) ? x : x + scrollLeft,
          scale,
        });
        /* To be compatible with merged cells */
        const bounds = getCellBounds({ rowIndex, columnIndex });

        return { rowIndex: bounds.top, columnIndex: bounds.left };
      },
      [
        scrollLeft,
        rowHeight,
        columnWidth,
        scrollTop,
        rowCount,
        columnCount,
        mergedCellMap,
      ]
    );

    /**
     * Get cell offset position from rowIndex, columnIndex
     */
    const getCellOffsetFromCoords = useCallback(
      (cell: CellInterface): CellPosition => {
        const {
          top: rowIndex,
          left: columnIndex,
          right,
          bottom,
        } = getCellBounds(cell);
        const x = getColumnOffset({
          index: columnIndex,
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        });
        const y = getRowOffset({
          index: rowIndex,
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        });
        const width =
          getColumnOffset({
            index: right + 1,
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          }) - x;
        const height =
          getRowOffset({
            index: bottom + 1,
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          }) - y;

        return {
          x,
          y,
          width,
          height,
        };
      },
      [mergedCellMap]
    );

    /**
     * Resize one or more columns
     */

    const resizeColumns = useCallback((indices: number[]) => {
      const leftMost = Math.min(...indices);
      resetAfterIndices({ columnIndex: leftMost }, false);
      instanceProps.current.recalcColumnIndices = indices;
      forceRender();
    }, []);

    /**
     * Resize one or more rows
     */
    const resizeRows = useCallback((indices: number[]) => {
      const topMost = Math.min(...indices);
      resetAfterIndices({ rowIndex: topMost }, false);
      instanceProps.current.recalcRowIndices = indices;
      forceRender();
    }, []);

    /* Always if the viewport changes */
    useEffect(() => {
      if (instanceProps.current.recalcColumnIndices.length) {
        instanceProps.current.recalcColumnIndices.length = 0;
      }
      if (instanceProps.current.recalcRowIndices.length) {
        instanceProps.current.recalcRowIndices.length = 0;
      }
    }, [rowStopIndex, columnStopIndex, scale]);

    /* Get current view port of the grid */
    const getViewPort = useCallback((): ViewPortProps => {
      return {
        rowStartIndex,
        rowStopIndex,
        columnStartIndex,
        columnStopIndex,
      };
    }, [rowStartIndex, rowStopIndex, columnStartIndex, columnStopIndex]);

    /**
     * When the grid is scrolling,
     * 1. Stage does not listen to any mouse events
     * 2. Div container does not listen to pointer events
     */
    const resetIsScrollingTimeoutID = useRef<TimeoutID | null>(null);
    const resetIsScrollingDebounced = useCallback(() => {
      if (resetIsScrollingTimeoutID.current !== null) {
        cancelTimeout(resetIsScrollingTimeoutID.current);
      }
      resetIsScrollingTimeoutID.current = requestTimeout(
        resetIsScrolling,
        RESET_SCROLL_EVENTS_DEBOUNCE_INTERVAL
      );
    }, []);
    /* Reset isScrolling */
    const resetIsScrolling = useCallback(() => {
      resetIsScrollingTimeoutID.current = null;

      setScrollState((prev) => {
        return {
          ...prev,
          isScrolling: false,
        };
      });
    }, []);

    /* Handle vertical scroll */
    const handleScroll = useCallback(
      (e) => {
        const { scrollTop } = e.target;

        setScrollState((prev) => ({
          ...prev,
          isScrolling: true,
          verticalScrollDirection:
            prev.scrollTop > scrollTop ? Direction.Up : Direction.Down,
          scrollTop,
        }));

        /* Scroll callbacks */
        onImmediateScroll?.({ scrollTop, scrollLeft });

        /* Reset isScrolling if required */
        resetIsScrollingDebounced();
      },
      [scrollLeft]
    );

    /* Handle horizontal scroll */
    const handleScrollLeft = useCallback(
      (e) => {
        const { scrollLeft } = e.target;
        setScrollState((prev) => ({
          ...prev,
          isScrolling: true,
          horizontalScrollDirection:
            prev.scrollLeft > scrollLeft ? Direction.Left : Direction.Right,
          scrollLeft,
        }));

        /* Scroll callbacks */
        onImmediateScroll?.({ scrollLeft, scrollTop });

        /* Reset isScrolling if required */
        resetIsScrollingDebounced();
      },
      [scrollTop]
    );

    /* Scroll based on left, top position */
    const scrollTo = useCallback(
      ({ scrollTop, scrollLeft }: OptionalScrollCoords) => {
        /* If scrollbar is visible, lets update it which triggers a state change */
        if (showScrollbar) {
          if (horizontalScrollRef.current && scrollLeft !== void 0)
            horizontalScrollRef.current.scrollLeft = scrollLeft;
          if (verticalScrollRef.current && scrollTop !== void 0)
            verticalScrollRef.current.scrollTop = scrollTop;
        } else {
          setScrollState((prev) => {
            return {
              ...prev,
              scrollLeft: scrollLeft == void 0 ? prev.scrollLeft : scrollLeft,
              scrollTop: scrollTop == void 0 ? prev.scrollTop : scrollTop,
            };
          });
        }
      },
      [showScrollbar]
    );

    /* Scroll grid to top */
    const scrollToTop = useCallback(() => {
      scrollTo({ scrollTop: 0, scrollLeft: 0 });
    }, []);

    /**
     * Scrollby utility
     */
    const scrollBy = useCallback(({ x, y }: PosXY) => {
      if (showScrollbar) {
        if (horizontalScrollRef.current && x !== void 0)
          horizontalScrollRef.current.scrollLeft += x;
        if (verticalScrollRef.current && y !== void 0)
          verticalScrollRef.current.scrollTop += y;
      } else {
        setScrollState((prev) => {
          return {
            ...prev,
            scrollLeft: x == void 0 ? prev.scrollLeft : prev.scrollLeft + x,
            scrollTop: y == void 0 ? prev.scrollTop : prev.scrollTop + y,
          };
        });
      }
    }, []);

    /**
     * Scrolls to cell
     * Respects frozen rows and columns
     */
    const scrollToItem = useCallback(
      (
        { rowIndex, columnIndex }: OptionalCellInterface,
        align: Align = Align.smart
      ) => {
        const isFrozenRow = rowIndex && rowIndex < frozenRows;
        const isFrozenColumn = columnIndex && columnIndex < frozenColumns;
        const frozenColumnOffset = getColumnOffset({
          index: frozenColumns,
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        });
        /* Making sure getColumnWidth works */
        const x = columnIndex
          ? getColumnOffset({
              index: columnIndex,
              rowHeight,
              columnWidth,
              instanceProps: instanceProps.current,
              scale,
            })
          : void 0;
        /* Making sure getRowHeight works */
        const y = rowIndex
          ? getRowOffset({
              index: rowIndex,
              rowHeight,
              columnWidth,
              instanceProps: instanceProps.current,
              scale,
            })
          : void 0;
        const width = columnIndex
          ? getColumnWidth(columnIndex, instanceProps.current)
          : 0;
        const height = rowIndex
          ? getRowHeight(rowIndex, instanceProps.current)
          : 0;
        const columnAlign = width > containerWidth ? Align.start : align;
        const rowAlign = height > containerHeight ? Align.start : align;
        const newScrollLeft =
          columnIndex !== void 0 && !isFrozenColumn
            ? getOffsetForColumnAndAlignment({
                index: columnIndex,
                containerHeight,
                containerWidth,
                columnCount,
                columnWidth,
                rowCount,
                rowHeight,
                scrollOffset: scrollLeft,
                instanceProps: instanceProps.current,
                scrollbarSize,
                frozenOffset: frozenColumnOffset,
                align: columnAlign,
                scale,
              })
            : void 0;

        const frozenRowOffset = getRowOffset({
          index: frozenRows,
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        });
        const newScrollTop =
          rowIndex !== void 0 && !isFrozenRow
            ? getOffsetForRowAndAlignment({
                index: rowIndex,
                containerHeight,
                containerWidth,
                columnCount,
                columnWidth,
                rowCount,
                rowHeight,
                scrollOffset: scrollTop,
                instanceProps: instanceProps.current,
                scrollbarSize,
                frozenOffset: frozenRowOffset,
                align: rowAlign,
                scale,
              })
            : void 0;

        const coords = {
          scrollLeft: newScrollLeft,
          scrollTop: newScrollTop,
        };
        const isOutsideViewport =
          (rowIndex !== void 0 &&
            rowIndex > rowStopIndex + (rowStopIndex - rowStartIndex)) ||
          (columnIndex !== void 0 &&
            columnIndex >
              columnStopIndex + (columnStopIndex - columnStartIndex));

        /* Scroll in the next frame, Useful when user wants to jump from 1st column to last */
        if (isOutsideViewport) {
          window.requestAnimationFrame(() => {
            scrollTo(coords);
          });
        } else scrollTo(coords);
      },
      [
        containerHeight,
        containerWidth,
        rowCount,
        columnCount,
        scrollbarSize,
        scrollLeft,
        scrollTop,
        frozenRows,
        frozenColumns,
      ]
    );

    /**
     * Fired when user tries to scroll the canvas
     */
    const handleWheel = useCallback(
      (event: globalThis.MouseWheelEvent) => {
        /* Prevent browser back in Mac */
        event.preventDefault();
        const { deltaX, deltaY, deltaMode } = event;
        /* If snaps are active */
        if (snap) {
          snapToRowThrottler.current({
            deltaY,
            rowStartIndex,
            rowCount,
            frozenRows,
          });
          snapToColumnThrottler.current({
            deltaX,
            columnStartIndex,
            columnCount,
            frozenColumns,
          });
          return;
        }
        /* Scroll natively */
        if (wheelingRef.current) return;
        let dx = deltaX;
        let dy = deltaY;

        /* Scroll only in one direction */
        const isHorizontal = Math.abs(dx) > Math.abs(dy);

        if (deltaMode === 1) {
          dy = dy * scrollbarSize;
        }
        if (!horizontalScrollRef.current || !verticalScrollRef.current) return;
        const currentScroll = isHorizontal
          ? horizontalScrollRef.current?.scrollLeft
          : verticalScrollRef.current?.scrollTop;
        wheelingRef.current = window.requestAnimationFrame(() => {
          wheelingRef.current = null;
          if (isHorizontal) {
            if (horizontalScrollRef.current)
              horizontalScrollRef.current.scrollLeft = currentScroll + dx;
          } else {
            if (verticalScrollRef.current)
              verticalScrollRef.current.scrollTop = currentScroll + dy;
          }
        });
      },
      [
        rowStartIndex,
        columnStartIndex,
        rowCount,
        columnCount,
        snap,
        frozenColumns,
        frozenRows,
      ]
    );

    /* Callback when visible rows or columns have changed */
    useEffect(() => {
      onViewChange?.({
        rowStartIndex,
        rowStopIndex,
        columnStartIndex,
        columnStopIndex,
      });
    }, [rowStartIndex, rowStopIndex, columnStartIndex, columnStopIndex]);

    /* Draw gridlines */
    const gridLines = [];
    const gridLinesFrozenRow = [];
    const gridLinesFrozenColumn = [];
    const gridLinesFrozenIntersection = [];
    if (showGridLines) {
      // Horizontal
      for (let rowIndex = rowStartIndex; rowIndex <= rowStopIndex; rowIndex++) {
        /* Ignore frozen rows */
        if (rowIndex < frozenRows || isHiddenRow?.(rowIndex)) continue;
        const x1 = getColumnOffset({
          index: frozenColumns,
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        });
        const x2 = getColumnOffset({
          index: Math.min(columnStopIndex + 1, columnCount),
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        });
        const y1 = getRowOffset({
          index: Math.min(rowIndex + 1, rowCount),
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        });
        const y2 = y1;
        gridLines.push(
          gridLineRenderer({
            points: [x1, y1, x2, y2],
            stroke: gridLineColor,
            strokeWidth: gridLineWidth,
            offsetY: -0.5,
            key: itemKey({ rowIndex: rowIndex, columnIndex: y1 }),
          })
        );
        gridLinesFrozenColumn.push(
          gridLineRenderer({
            points: [0, y1, x2, y2],
            stroke: gridLineColor,
            strokeWidth: gridLineWidth,
            offsetY: -0.5,
            key: itemKey({ rowIndex: rowIndex, columnIndex: y1 }),
          })
        );
      }
      // Vertical
      for (
        let columnIndex = columnStartIndex;
        columnIndex <= columnStopIndex;
        columnIndex++
      ) {
        const x1 = getColumnOffset({
          index: Math.min(columnIndex + 1, columnCount),
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        });
        const x2 = x1;
        const y1 = getRowOffset({
          index: frozenRows,
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        });
        const y2 = getRowOffset({
          index: Math.min(rowStopIndex + 1, rowCount),
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        });
        gridLines.push(
          gridLineRenderer({
            points: [x1, y1, x2, y2],
            stroke: gridLineColor,
            strokeWidth: gridLineWidth,
            offsetX: -0.5,
            key: itemKey({ rowIndex: x1, columnIndex: columnIndex }),
          })
        );
        gridLinesFrozenRow.push(
          gridLineRenderer({
            points: [x1, 0, x2, y2],
            stroke: gridLineColor,
            strokeWidth: gridLineWidth,
            offsetX: -0.5,
            key: itemKey({ rowIndex: x1, columnIndex: columnIndex }),
          })
        );
      }
      for (
        let rowIndex = 0;
        rowIndex < Math.min(columnStopIndex, frozenRows);
        rowIndex++
      ) {
        if (isHiddenRow?.(rowIndex)) continue;
        const x1 = 0;
        const x2 = getColumnOffset({
          index: Math.min(columnStopIndex + 1, columnCount),
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        });
        const y1 = getRowOffset({
          index: Math.min(rowIndex + 1, rowCount),
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        });
        const y2 = y1;
        gridLinesFrozenRow.push(
          gridLineRenderer({
            points: [x1, y1, x2, y2],
            stroke: gridLineColor,
            strokeWidth: gridLineWidth,
            offsetY: -0.5,
            key: itemKey({ rowIndex: rowIndex, columnIndex: y1 }),
          })
        );
        gridLinesFrozenIntersection.push(
          gridLineRenderer({
            points: [x1, y1, x2, y2],
            stroke: gridLineColor,
            strokeWidth: gridLineWidth,
            offsetY: -0.5,
            key: itemKey({ rowIndex: rowIndex, columnIndex: y1 }),
          })
        );
      }

      for (
        let columnIndex = 0;
        columnIndex < Math.min(columnStopIndex, frozenColumns);
        columnIndex++
      ) {
        const x1 = getColumnOffset({
          index: Math.min(columnIndex + 1, columnCount),
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        });
        const x2 = x1;
        const y1 = 0;
        const y2 = getRowOffset({
          index: Math.min(rowStopIndex + 1, rowCount),
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        });
        gridLinesFrozenColumn.push(
          gridLineRenderer({
            points: [x1, y1, x2, y2],
            stroke: gridLineColor,
            strokeWidth: gridLineWidth,
            offsetX: -0.5,
            key: itemKey({ rowIndex: x1, columnIndex: columnIndex }),
          })
        );
        gridLinesFrozenIntersection.push(
          gridLineRenderer({
            points: [x1, y1, x2, y2],
            stroke: gridLineColor,
            strokeWidth: gridLineWidth,
            offsetX: -0.5,
            key: itemKey({ rowIndex: x1, columnIndex: columnIndex }),
          })
        );
      }
    }

    const mergedCellRenderMap = new Set();
    /* Draw all cells */
    const cells: React.ReactNodeArray = [];
    /**
     * Lets users draw cells on top of existing canvas
     */
    const cellOverlays: React.ReactNodeArray = [];
    if (columnCount > 0 && rowCount) {
      for (let rowIndex = rowStartIndex; rowIndex <= rowStopIndex; rowIndex++) {
        /* Skip frozen rows */
        if (rowIndex < frozenRows || isHiddenRow?.(rowIndex)) {
          continue;
        }
        /**
         * Do any pre-processing of the row before being renderered.
         * Useful for `react-table` to call `prepareRow(row)`
         */
        onBeforeRenderRow?.(rowIndex);

        for (
          let columnIndex = columnStartIndex;
          columnIndex <= columnStopIndex;
          columnIndex++
        ) {
          /**
           * Skip frozen columns
           * Skip merged cells that are out of bounds
           */
          if (columnIndex < frozenColumns) {
            continue;
          }

          const isMerged = isMergedCell({ rowIndex, columnIndex });
          const bounds = getCellBounds({ rowIndex, columnIndex });
          const actualRowIndex = isMerged ? bounds.top : rowIndex;
          const actualColumnIndex = isMerged ? bounds.left : columnIndex;
          const actualBottom = Math.max(rowIndex, bounds.bottom);
          const actualRight = Math.max(columnIndex, bounds.right);
          if (isMerged) {
            const cellId = cellIdentifier(bounds.top, bounds.left);
            if (mergedCellRenderMap.has(cellId)) {
              continue;
            }
            mergedCellRenderMap.add(cellId);
          }

          const y = getRowOffset({
            index: actualRowIndex,
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          });
          const height =
            getRowOffset({
              index: actualBottom,
              rowHeight,
              columnWidth,
              instanceProps: instanceProps.current,
              scale,
            }) -
            y +
            getRowHeight(actualBottom, instanceProps.current);

          const x = getColumnOffset({
            index: actualColumnIndex,
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          });

          const width =
            getColumnOffset({
              index: actualRight,
              rowHeight,
              columnWidth,
              instanceProps: instanceProps.current,
              scale,
            }) -
            x +
            getColumnWidth(actualRight, instanceProps.current);

          cells.push(
            itemRenderer({
              x,
              y,
              width,
              height,
              rowIndex: actualRowIndex,
              columnIndex: actualColumnIndex,
              isMergedCell: isMerged,
              key: itemKey({
                rowIndex: actualRowIndex,
                columnIndex: actualColumnIndex,
              }),
            })
          );

          if (enableCellOverlay) {
            cellOverlays.push(
              overlayRenderer({
                x,
                y,
                width,
                height,
                rowIndex: actualRowIndex,
                columnIndex: actualColumnIndex,
                isMergedCell: isMerged,
                key: itemKey({
                  rowIndex: actualRowIndex,
                  columnIndex: actualColumnIndex,
                }),
              })
            );
          }
        }
      }
    }

    /**
     * Extend certain cells.
     * Mimics google sheets functionality where
     * oevrflowed cell content can cover adjacent cells
     */
    const ranges = [];
    for (const { rowIndex, columnIndex, toColumnIndex } of cellAreas) {
      /* Skip merged cells, Merged  cell cannot be extended */
      if (
        rowIndex < frozenRows ||
        columnIndex < frozenColumns ||
        isMergedCell({ rowIndex, columnIndex })
      ) {
        continue;
      }
      const x = getColumnOffset({
        index: columnIndex,
        rowHeight,
        columnWidth,
        instanceProps: instanceProps.current,
        scale,
      });
      const y = getRowOffset({
        index: rowIndex,
        rowHeight,
        columnWidth,
        instanceProps: instanceProps.current,
        scale,
      });
      const height = getRowHeight(rowIndex, instanceProps.current);
      const { x: offsetX = 0 } = getCellOffsetFromCoords({
        rowIndex,
        columnIndex: toColumnIndex + 1,
      });
      ranges.push(
        itemRenderer({
          x,
          y,
          width: offsetX - x,
          height,
          rowIndex,
          columnIndex,
          key: `range:${itemKey({ rowIndex, columnIndex })}`,
        })
      );
    }

    /* Draw frozen rows */
    const frozenRowCells = [];
    const frozenRowCellOverlays: React.ReactNodeArray = [];
    for (
      let rowIndex = 0;
      rowIndex < Math.min(rowStopIndex, frozenRows);
      rowIndex++
    ) {
      if (isHiddenRow?.(rowIndex)) continue;
      /**
       * Do any pre-processing of the row before being renderered.
       * Useful for `react-table` to call `prepareRow(row)`
       */
      onBeforeRenderRow?.(rowIndex);

      for (
        let columnIndex = columnStartIndex;
        columnIndex <= columnStopIndex;
        columnIndex++
      ) {
        /* Skip merged cells columns */
        if (columnIndex < frozenColumns) {
          continue;
        }

        const isMerged = isMergedCell({ rowIndex, columnIndex });
        const bounds = getCellBounds({ rowIndex, columnIndex });
        const actualRowIndex = isMerged ? bounds.top : rowIndex;
        const actualColumnIndex = isMerged ? bounds.left : columnIndex;
        const actualBottom = Math.max(rowIndex, bounds.bottom);
        const actualRight = Math.max(columnIndex, bounds.right);
        if (isMerged) {
          const cellId = cellIdentifier(bounds.top, bounds.left);
          if (mergedCellRenderMap.has(cellId)) {
            continue;
          }
          mergedCellRenderMap.add(cellId);
        }

        const y = getRowOffset({
          index: actualRowIndex,
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        });
        const height =
          getRowOffset({
            index: actualBottom,
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          }) -
          y +
          getRowHeight(actualBottom, instanceProps.current);

        const x = getColumnOffset({
          index: actualColumnIndex,
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        });

        const width =
          getColumnOffset({
            index: actualRight,
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          }) -
          x +
          getColumnWidth(actualRight, instanceProps.current);

        frozenRowCells.push(
          itemRenderer({
            x,
            y,
            width,
            height,
            rowIndex: actualRowIndex,
            columnIndex: actualColumnIndex,
            isMergedCell: isMerged,
            key: itemKey({
              rowIndex: actualRowIndex,
              columnIndex: actualColumnIndex,
            }),
          })
        );

        if (enableCellOverlay) {
          frozenRowCellOverlays.push(
            overlayRenderer({
              x,
              y,
              width,
              height,
              rowIndex: actualRowIndex,
              columnIndex: actualColumnIndex,
              isMergedCell: isMerged,
              key: itemKey({
                rowIndex: actualRowIndex,
                columnIndex: actualColumnIndex,
              }),
            })
          );
        }
      }
    }

    /* Draw frozen columns */
    const frozenColumnCells = [];
    const frozenColumnCellOverlays = [];
    for (let rowIndex = rowStartIndex; rowIndex <= rowStopIndex; rowIndex++) {
      if (rowIndex < frozenRows || isHiddenRow?.(rowIndex)) {
        continue;
      }
      /**
       * Do any pre-processing of the row before being renderered.
       * Useful for `react-table` to call `prepareRow(row)`
       */
      onBeforeRenderRow?.(rowIndex);

      for (
        let columnIndex = 0;
        columnIndex < Math.min(columnStopIndex, frozenColumns);
        columnIndex++
      ) {
        const isMerged = isMergedCell({ rowIndex, columnIndex });
        const bounds = getCellBounds({ rowIndex, columnIndex });
        const actualRowIndex = isMerged ? bounds.top : rowIndex;
        const actualColumnIndex = isMerged ? bounds.left : columnIndex;
        const actualBottom = Math.max(rowIndex, bounds.bottom);
        const actualRight = Math.max(columnIndex, bounds.right);
        if (isMerged) {
          const cellId = cellIdentifier(bounds.top, bounds.left);
          if (mergedCellRenderMap.has(cellId)) {
            continue;
          }
          mergedCellRenderMap.add(cellId);
        }

        const y = getRowOffset({
          index: actualRowIndex,
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        });
        const height =
          getRowOffset({
            index: actualBottom,
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          }) -
          y +
          getRowHeight(actualBottom, instanceProps.current);

        const x = getColumnOffset({
          index: actualColumnIndex,
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        });

        const width =
          getColumnOffset({
            index: actualRight,
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          }) -
          x +
          getColumnWidth(actualRight, instanceProps.current);

        frozenColumnCells.push(
          itemRenderer({
            x,
            y,
            width,
            height,
            rowIndex: actualRowIndex,
            columnIndex: actualColumnIndex,
            isMergedCell: isMerged,
            key: itemKey({
              rowIndex: actualRowIndex,
              columnIndex: actualColumnIndex,
            }),
          })
        );

        if (enableCellOverlay) {
          frozenColumnCellOverlays.push(
            overlayRenderer({
              x,
              y,
              width,
              height,
              rowIndex: actualRowIndex,
              columnIndex: actualColumnIndex,
              isMergedCell: isMerged,
              key: itemKey({
                rowIndex: actualRowIndex,
                columnIndex: actualColumnIndex,
              }),
            })
          );
        }
      }
    }

    /**
     * Frozen column shadow
     */
    const frozenColumnShadow = useMemo(() => {
      const frozenColumnLineX = getColumnOffset({
        index: frozenColumns,
        rowHeight,
        columnWidth,
        instanceProps: instanceProps.current,
        scale,
      });
      const frozenColumnLineY = getRowOffset({
        index: Math.min(rowStopIndex + 1, rowCount),
        rowHeight,
        columnWidth,
        instanceProps: instanceProps.current,
        scale,
      });
      return (
        <Line
          points={[frozenColumnLineX, 0, frozenColumnLineX, frozenColumnLineY]}
          offsetX={-0.5}
          strokeWidth={1}
          shadowForStrokeEnabled={false}
          strokeScaleEnabled={false}
          hitStrokeWidth={0}
          listening={false}
          perfectDrawEnabled={false}
          {...shadowSettings}
        />
      );
    }, [
      shadowSettings,
      frozenColumns,
      rowStopIndex,
      rowCount,
      instanceProps.current.lastMeasuredColumnIndex,
      instanceProps.current.recalcColumnIndices,
    ]);

    /**
     * Frozen row shadow
     */
    const frozenRowShadow = useMemo(() => {
      const frozenRowLineY = getRowOffset({
        index: frozenRows,
        rowHeight,
        columnWidth,
        instanceProps: instanceProps.current,
        scale,
      });
      const frozenRowLineX = getColumnOffset({
        index: Math.min(columnStopIndex + 1, columnCount),
        rowHeight,
        columnWidth,
        instanceProps: instanceProps.current,
        scale,
      });
      return (
        <Line
          points={[0, frozenRowLineY, frozenRowLineX, frozenRowLineY]}
          offsetY={-0.5}
          strokeWidth={1}
          shadowForStrokeEnabled={false}
          strokeScaleEnabled={false}
          hitStrokeWidth={0}
          listening={false}
          perfectDrawEnabled={false}
          {...shadowSettings}
        />
      );
    }, [
      shadowSettings,
      frozenRows,
      columnStopIndex,
      columnCount,
      instanceProps.current.lastMeasuredRowIndex,
      instanceProps.current.recalcRowIndices,
    ]);

    /* Draw frozen intersection cells */
    const frozenIntersectionCells = [];
    const frozenIntersectionCellOverlays = [];
    for (
      let rowIndex = 0;
      rowIndex < Math.min(rowStopIndex, frozenRows);
      rowIndex++
    ) {
      if (isHiddenRow?.(rowIndex)) continue;
      for (
        let columnIndex = 0;
        columnIndex < Math.min(columnStopIndex, frozenColumns);
        columnIndex++
      ) {
        const isMerged = isMergedCell({ rowIndex, columnIndex });
        const bounds = getCellBounds({ rowIndex, columnIndex });
        const actualRowIndex = isMerged ? bounds.top : rowIndex;
        const actualColumnIndex = isMerged ? bounds.left : columnIndex;
        const actualBottom = Math.max(rowIndex, bounds.bottom);
        const actualRight = Math.max(columnIndex, bounds.right);
        if (isMerged) {
          const cellId = cellIdentifier(bounds.top, bounds.left);
          if (mergedCellRenderMap.has(cellId)) {
            continue;
          }
          mergedCellRenderMap.add(cellId);
        }

        const y = getRowOffset({
          index: actualRowIndex,
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        });
        const height =
          getRowOffset({
            index: actualBottom,
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          }) -
          y +
          getRowHeight(actualBottom, instanceProps.current);

        const x = getColumnOffset({
          index: actualColumnIndex,
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        });

        const width =
          getColumnOffset({
            index: actualRight,
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          }) -
          x +
          getColumnWidth(actualRight, instanceProps.current);

        frozenIntersectionCells.push(
          itemRenderer({
            x,
            y,
            width,
            height,
            rowIndex: actualRowIndex,
            columnIndex: actualColumnIndex,
            isMergedCell: isMerged,
            key: itemKey({
              rowIndex: actualRowIndex,
              columnIndex: actualColumnIndex,
            }),
          })
        );

        if (enableCellOverlay) {
          frozenIntersectionCellOverlays.push(
            overlayRenderer({
              x,
              y,
              width,
              height,
              rowIndex: actualRowIndex,
              columnIndex: actualColumnIndex,
              isMergedCell: isMerged,
              key: itemKey({
                rowIndex: actualRowIndex,
                columnIndex: actualColumnIndex,
              }),
            })
          );
        }
      }
    }

    /**
     * Renders active cell
     */
    let fillHandleDimension = {};
    let activeCellSelection = null;
    let activeCellSelectionFrozenColumn = null;
    let activeCellSelectionFrozenRow = null;
    let activeCellSelectionFrozenIntersection = null;
    if (activeCell) {
      const bounds = getCellBounds(activeCell);
      const { top, left, right, bottom } = bounds;
      const actualBottom = Math.min(rowStopIndex, bottom);
      const actualRight = Math.min(columnStopIndex, right);
      const isInFrozenColumn = left < frozenColumns;
      const isInFrozenRow = top < frozenRows;
      const isInFrozenIntersection = isInFrozenRow && isInFrozenColumn;
      const y = getRowOffset({
        index: top,
        rowHeight,
        columnWidth,
        instanceProps: instanceProps.current,
        scale,
      });
      const height =
        getRowOffset({
          index: actualBottom,
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        }) -
        y +
        getRowHeight(actualBottom, instanceProps.current);

      const x = getColumnOffset({
        index: left,
        rowHeight,
        columnWidth,
        instanceProps: instanceProps.current,
        scale,
      });

      const width =
        getColumnOffset({
          index: actualRight,
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        }) -
        x +
        getColumnWidth(actualRight, instanceProps.current);

      const cell = selectionRenderer({
        stroke: selectionBorderColor,
        strokeWidth: activeCellStrokeWidth,
        fill: "transparent",
        x: x,
        y: y,
        width: width,
        height: height,
      });

      if (isInFrozenIntersection) {
        activeCellSelectionFrozenIntersection = cell;
      } else if (isInFrozenRow) {
        activeCellSelectionFrozenRow = cell;
      } else if (isInFrozenColumn) {
        activeCellSelectionFrozenColumn = cell;
      } else {
        activeCellSelection = cell;
      }

      fillHandleDimension = {
        x: x + width,
        y: y + height,
      };
    }

    /**
     * Convert selections to area
     * Removed useMemo as changes to lastMeasureRowIndex, lastMeasuredColumnIndex,
     * does not trigger useMemo
     * Dependencies : [selections, rowStopIndex, columnStopIndex, instanceProps]
     */

    let isSelectionInProgress = false;
    const selectionAreas = [];
    const selectionAreasFrozenColumns = [];
    const selectionAreasFrozenRows = [];
    const selectionAreasIntersection = [];
    for (let i = 0; i < selections.length; i++) {
      const { bounds, inProgress, style } = selections[i];
      const { top, left, right, bottom } = bounds;
      const selectionBounds = { x: 0, y: 0, width: 0, height: 0 };
      const actualBottom = Math.min(rowStopIndex, bottom);
      const actualRight = Math.min(columnStopIndex, right);
      const isLeftBoundFrozen = left < frozenColumns;
      const isTopBoundFrozen = top < frozenRows;
      const isIntersectionFrozen = top < frozenRows && left < frozenColumns;
      const isLast = i === selections.length - 1;
      const styles = {
        stroke: inProgress ? selectionBackgroundColor : selectionBorderColor,
        fill: selectionBackgroundColor,
        ...style,
      };
      if (inProgress) isSelectionInProgress = true;
      selectionBounds.y = getRowOffset({
        index: top,
        rowHeight,
        columnWidth,
        instanceProps: instanceProps.current,
        scale,
      });
      selectionBounds.height =
        getRowOffset({
          index: actualBottom,
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        }) -
        selectionBounds.y +
        getRowHeight(actualBottom, instanceProps.current);

      selectionBounds.x = getColumnOffset({
        index: left,
        rowHeight,
        columnWidth,
        instanceProps: instanceProps.current,
        scale,
      });

      selectionBounds.width =
        getColumnOffset({
          index: actualRight,
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        }) -
        selectionBounds.x +
        getColumnWidth(actualRight, instanceProps.current);

      if (isLeftBoundFrozen) {
        const frozenColumnSelectionWidth =
          getColumnOffset({
            index: Math.min(right + 1, frozenColumns),
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          }) -
          getColumnOffset({
            index: left,
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          });
        selectionAreasFrozenColumns.push(
          selectionRenderer({
            ...styles,
            key: i,
            x: selectionBounds.x,
            y: selectionBounds.y,
            width: frozenColumnSelectionWidth,
            height: selectionBounds.height,
            strokeRightWidth:
              frozenColumnSelectionWidth === selectionBounds.width
                ? selectionStrokeWidth
                : 0,
          })
        );
      }

      if (isTopBoundFrozen) {
        const frozenRowSelectionHeight =
          getRowOffset({
            index: Math.min(bottom + 1, frozenRows),
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          }) -
          getRowOffset({
            index: top,
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          });
        selectionAreasFrozenRows.push(
          selectionRenderer({
            ...styles,
            key: i,
            x: selectionBounds.x,
            y: selectionBounds.y,
            width: selectionBounds.width,
            height: frozenRowSelectionHeight,
            strokeBottomWidth:
              frozenRowSelectionHeight === selectionBounds.height
                ? selectionStrokeWidth
                : 0,
          })
        );
      }

      if (isIntersectionFrozen) {
        const frozenIntersectionSelectionHeight =
          getRowOffset({
            index: Math.min(bottom + 1, frozenRows),
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          }) -
          getRowOffset({
            index: top,
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          });

        const frozenIntersectionSelectionWidth =
          getColumnOffset({
            index: Math.min(right + 1, frozenColumns),
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          }) -
          getColumnOffset({
            index: left,
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          });

        selectionAreasIntersection.push(
          selectionRenderer({
            ...styles,
            key: i,
            x: selectionBounds.x,
            y: selectionBounds.y,
            width: frozenIntersectionSelectionWidth,
            height: frozenIntersectionSelectionHeight,
            strokeBottomWidth:
              frozenIntersectionSelectionHeight === selectionBounds.height
                ? selectionStrokeWidth
                : 0,
            strokeRightWidth:
              frozenIntersectionSelectionWidth === selectionBounds.width
                ? selectionStrokeWidth
                : 0,
          })
        );
      }

      selectionAreas.push(
        selectionRenderer({
          ...styles,
          key: i,
          x: selectionBounds.x,
          y: selectionBounds.y,
          width: selectionBounds.width,
          height: selectionBounds.height,
        })
      );

      if (isLast) {
        fillHandleDimension = {
          x: selectionBounds.x + selectionBounds.width,
          y: selectionBounds.y + selectionBounds.height,
        };
      }
    }

    /**
     * Fillselection
     */
    let fillSelections = null;
    if (fillSelection) {
      const { bounds } = fillSelection;
      const { top, left, right, bottom } = bounds;
      const actualBottom = Math.min(rowStopIndex, bottom);
      const actualRight = Math.min(columnStopIndex, right);
      const x = getColumnOffset({
        index: left,
        rowHeight,
        columnWidth,
        instanceProps: instanceProps.current,
        scale,
      });
      const y = getRowOffset({
        index: top,
        rowHeight,
        columnWidth,
        instanceProps: instanceProps.current,
        scale,
      });
      const height =
        getRowOffset({
          index: actualBottom,
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        }) -
        y +
        getRowHeight(actualBottom, instanceProps.current);
      const width =
        getColumnOffset({
          index: actualRight,
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        }) -
        x +
        getColumnWidth(actualRight, instanceProps.current);
      fillSelections = selectionRenderer({
        x,
        y,
        width,
        height,
        stroke: "gray",
        strokeStyle: "dashed",
      });
    }

    const borderStyleCells = [];
    const borderStyleCellsFrozenColumns = [];
    const borderStyleCellsFrozenRows = [];
    const borderStyleCellsIntersection = [];
    for (let i = 0; i < borderStyles.length; i++) {
      const { bounds, style } = borderStyles[i];
      const { top, right, bottom, left } = bounds;
      const isLeftBoundFrozen = left < frozenColumns;
      const isTopBoundFrozen = top < frozenRows;
      const isIntersectionFrozen = top < frozenRows && left < frozenColumns;
      const x = getColumnOffset({
        index: left,
        rowHeight,
        columnWidth,
        instanceProps: instanceProps.current,
        scale,
      });
      const y = getRowOffset({
        index: top,
        rowHeight,
        columnWidth,
        instanceProps: instanceProps.current,
        scale,
      });
      const width =
        getColumnOffset({
          index: Math.min(columnCount - 1, right + 1),
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        }) - x;
      const height =
        getRowOffset({
          index: Math.min(rowCount - 1, bottom + 1),
          rowHeight,
          columnWidth,
          instanceProps: instanceProps.current,
          scale,
        }) - y;

      borderStyleCells.push(
        createHTMLBox({
          x,
          y,
          key: i,
          width,
          height,
          ...style,
        })
      );

      if (isLeftBoundFrozen) {
        const frozenColumnSelectionWidth =
          getColumnOffset({
            index: Math.min(right + 1, frozenColumns),
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          }) -
          getColumnOffset({
            index: left,
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          });
        borderStyleCellsFrozenColumns.push(
          createHTMLBox({
            ...style,
            x,
            y,
            key: i,
            width: frozenColumnSelectionWidth,
            height,
            strokeRightWidth:
              frozenColumnSelectionWidth === width
                ? style?.strokeRightWidth || style?.strokeWidth
                : 0,
          })
        );
      }

      if (isTopBoundFrozen) {
        const frozenRowSelectionHeight =
          getRowOffset({
            index: Math.min(bottom + 1, frozenRows),
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          }) -
          getRowOffset({
            index: top,
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          });

        borderStyleCellsFrozenRows.push(
          createHTMLBox({
            ...style,
            x,
            y,
            key: i,
            width,
            height: frozenRowSelectionHeight,
            strokeBottomWidth:
              frozenRowSelectionHeight === height
                ? style?.strokeBottomWidth || style?.strokeWidth
                : 0,
          })
        );
      }

      if (isIntersectionFrozen) {
        const frozenIntersectionSelectionHeight =
          getRowOffset({
            index: Math.min(bottom + 1, frozenRows),
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          }) -
          getRowOffset({
            index: top,
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          });

        const frozenIntersectionSelectionWidth =
          getColumnOffset({
            index: Math.min(right + 1, frozenColumns),
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          }) -
          getColumnOffset({
            index: left,
            rowHeight,
            columnWidth,
            instanceProps: instanceProps.current,
            scale,
          });

        borderStyleCellsIntersection.push(
          createHTMLBox({
            ...style,
            x,
            y,
            key: i,
            width: frozenIntersectionSelectionWidth,
            height: frozenIntersectionSelectionHeight,
            strokeBottomWidth:
              frozenIntersectionSelectionHeight === height
                ? selectionStrokeWidth
                : 0,
            strokeRightWidth:
              frozenIntersectionSelectionWidth === width
                ? selectionStrokeWidth
                : 0,
          })
        );
      }
    }

    /* Spacing for frozen row/column clip */
    const frozenSpacing = 1;
    /**
     * Prevents drawing hit region when scrolling
     */
    const listenToEvents = !isScrolling;
    /* Frozen row shadow */
    const frozenRowShadowComponent =
      showFrozenShadow && frozenRows !== 0 ? frozenRowShadow : null;
    /* Frozen column shadow */
    const frozenColumnShadowComponent =
      showFrozenShadow && frozenColumns !== 0 ? frozenColumnShadow : null;
    const stageChildren = (
      <>
        <Layer>
          <Group
            clipX={frozenColumnWidth}
            clipY={frozenRowHeight}
            clipWidth={containerWidth - frozenColumnWidth}
            clipHeight={containerHeight - frozenRowHeight}
          >
            <Group offsetY={scrollTop} offsetX={scrollLeft}>
              {gridLines}
              {cells}
              {cellOverlays}
              {ranges}
            </Group>
          </Group>

          <Group
            clipX={frozenColumnWidth}
            clipY={0}
            clipWidth={containerWidth - frozenColumnWidth}
            clipHeight={frozenRowHeight + frozenSpacing}
          >
            <Group offsetY={0} offsetX={scrollLeft}>
              {gridLinesFrozenRow}
              {frozenRowCells}
              {frozenRowShadowComponent}
              {frozenRowCellOverlays}
            </Group>
          </Group>
          <Group
            clipX={0}
            clipY={frozenRowHeight}
            clipWidth={frozenColumnWidth + frozenSpacing}
            clipHeight={containerHeight - frozenRowHeight}
          >
            <Group offsetY={scrollTop} offsetX={0}>
              {gridLinesFrozenColumn}
              {frozenColumnCells}
              {frozenColumnShadowComponent}
              {frozenColumnCellOverlays}
            </Group>
          </Group>
          <Group
            offsetY={0}
            offsetX={0}
            clipX={0}
            clipY={0}
            clipWidth={frozenColumnWidth + frozenSpacing}
            clipHeight={frozenRowHeight + frozenSpacing}
          >
            {gridLinesFrozenIntersection}
            {frozenIntersectionCells}
            {frozenRowShadowComponent}
            {frozenColumnShadowComponent}
            {frozenIntersectionCellOverlays}
          </Group>
        </Layer>
        {children && typeof children === "function"
          ? children({
              scrollLeft,
              scrollTop,
            })
          : null}
      </>
    );
    const fillHandleWidth = 8;
    const fillhandleComponent =
      showFillHandle && !isSelectionInProgress ? (
        <FillHandle
          {...fillHandleDimension}
          stroke={selectionBorderColor}
          size={fillHandleWidth}
          borderColor={fillhandleBorderColor}
          {...fillHandleProps}
        />
      ) : null;
    const selectionChildren = (
      <div
        style={{
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: frozenColumnWidth,
            top: frozenRowHeight,
            right: 0,
            bottom: 0,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              transform: `translate(-${scrollLeft + frozenColumnWidth}px, -${
                scrollTop + frozenRowHeight
              }px)`,
            }}
          >
            {borderStyleCells}
            {fillSelections}
            {selectionAreas}
            {activeCellSelection}
            {fillhandleComponent}
          </div>
        </div>
        {frozenColumns ? (
          <div
            style={{
              position: "absolute",
              width: frozenColumnWidth + fillHandleWidth,
              top: frozenRowHeight,
              left: 0,
              bottom: 0,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                transform: `translate(0, -${scrollTop + frozenRowHeight}px)`,
              }}
            >
              {borderStyleCellsFrozenColumns}
              {selectionAreasFrozenColumns}
              {activeCellSelectionFrozenColumn}
              {fillhandleComponent}
            </div>
          </div>
        ) : null}
        {frozenRows ? (
          <div
            style={{
              position: "absolute",
              height: frozenRowHeight + fillHandleWidth,
              left: frozenColumnWidth,
              right: 0,
              top: 0,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                transform: `translate(-${scrollLeft + frozenColumnWidth}px, 0)`,
              }}
            >
              {borderStyleCellsFrozenRows}
              {selectionAreasFrozenRows}
              {activeCellSelectionFrozenRow}
              {fillhandleComponent}
            </div>
          </div>
        ) : null}
        {frozenRows && frozenColumns ? (
          <div
            style={{
              position: "absolute",
              height: frozenRowHeight + fillHandleWidth,
              width: frozenColumnWidth + fillHandleWidth,
              left: 0,
              top: 0,
              overflow: "hidden",
              pointerEvents: "none",
            }}
          >
            {borderStyleCellsIntersection}
            {selectionAreasIntersection}
            {activeCellSelectionFrozenIntersection}
            {fillhandleComponent}
          </div>
        ) : null}
      </div>
    );
    return (
      <div
        style={{
          position: "relative",
          width: containerWidth,
          userSelect: "none",
        }}
        className="rowsncolumns-grid"
      >
        <div
          className="rowsncolumns-grid-container"
          tabIndex={0}
          ref={containerRef}
          {...rest}
        >
          <Stage
            width={containerWidth}
            height={containerHeight}
            ref={stageRef}
            listening={listenToEvents}
            {...stageProps}
          >
            {wrapper(stageChildren)}
          </Stage>
        </div>
        {selectionChildren}
        {showScrollbar ? (
          <>
            <div
              tabIndex={-1}
              style={{
                height: containerHeight,
                overflow: "scroll",
                position: "absolute",
                right: 0,
                top: 0,
                width: scrollbarSize,
                willChange: "transform",
              }}
              onScroll={handleScroll}
              ref={verticalScrollRef}
            >
              <div
                style={{
                  position: "absolute",
                  height: estimatedTotalHeight,
                  width: 1,
                }}
              />
            </div>
            <div
              tabIndex={-1}
              style={{
                overflow: "scroll",
                position: "absolute",
                bottom: 0,
                left: 0,
                width: containerWidth,
                height: scrollbarSize,
                willChange: "transform",
              }}
              onScroll={handleScrollLeft}
              ref={horizontalScrollRef}
            >
              <div
                style={{
                  position: "absolute",
                  width: estimatedTotalWidth,
                  height: 1,
                }}
              />
            </div>
          </>
        ) : null}
      </div>
    );
  })
);

export default Grid;
