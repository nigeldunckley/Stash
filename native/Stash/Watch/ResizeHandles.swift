#if os(macOS)
import SwiftUI

/// A corner you can drag to resize the mini player or the floating window.
enum ResizeCorner: CaseIterable {
  case topLeading, topTrailing, bottomLeading, bottomTrailing

  var isLeading: Bool { self == .topLeading || self == .bottomLeading }
  var isTop: Bool { self == .topLeading || self == .topTrailing }

  var alignment: Alignment {
    switch self {
    case .topLeading: return .topLeading
    case .topTrailing: return .topTrailing
    case .bottomLeading: return .bottomLeading
    case .bottomTrailing: return .bottomTrailing
    }
  }

  var pointer: FrameResizePosition {
    switch self {
    case .topLeading: return .topLeading
    case .topTrailing: return .topTrailing
    case .bottomLeading: return .bottomLeading
    case .bottomTrailing: return .bottomTrailing
    }
  }
}

/// Invisible grab areas on the four corners, with the resize pointer. Calls back with the drag
/// as it goes, then with nil when it ends.
struct ResizeHandles: View {
  let onResize: (ResizeCorner, DragGesture.Value?) -> Void

  var body: some View {
    ZStack {
      ForEach(ResizeCorner.allCases, id: \.self) { corner in
        Color.clear
          .frame(width: 12, height: 12)
          .contentShape(Rectangle())
          .pointerStyle(.frameResize(position: corner.pointer))
          .gesture(
            DragGesture(minimumDistance: 1, coordinateSpace: .global)
              .onChanged { onResize(corner, $0) }
              .onEnded { _ in onResize(corner, nil) }
          )
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: corner.alignment)
      }
    }
  }
}

/// A video's size for a width, at 16:9.
func videoHeight(_ width: CGFloat) -> CGFloat { (width * 9 / 16).rounded() }
#endif
