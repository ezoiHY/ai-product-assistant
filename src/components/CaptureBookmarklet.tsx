"use client";

import { MousePointerClick } from "lucide-react";
import { useEffect, useRef } from "react";
import { bookmarkletHref } from "@/lib/capture";
import { ICON_STROKE, IconTile } from "./ui";

/** Draggable "浏览器带回" bookmark. React blocks javascript: hrefs in JSX, so the
 *  (fixed, self-authored) href is set on the DOM node after mount. */
export function CaptureBookmarklet() {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    ref.current?.setAttribute("href", bookmarkletHref(window.location.origin));
  }, []);

  return (
    <div className="rounded-[18px] bg-success-tint p-4">
      <div className="flex items-start gap-3">
        <IconTile icon={MousePointerClick} color="green" size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-label">浏览器带回（推荐）</p>
          <p className="mt-1 text-[13px] leading-6 text-label-2">
            Amazon 拦的是服务器，不拦你的浏览器。把下面的按钮<strong className="font-medium text-label">拖到书签栏</strong>，以后在 Amazon 商品页点一下，页面就会带回这里继续分析，信息和直连抓取一样完整。
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <a
              ref={ref}
              draggable
              onClick={(e) => {
                e.preventDefault();
                alert("请把这个按钮拖到浏览器的书签栏，然后在 Amazon 商品页上点击书签。");
              }}
              title="拖到书签栏"
              className="btn btn-primary cursor-grab active:cursor-grabbing"
            >
              <MousePointerClick className="h-3.5 w-3.5" strokeWidth={ICON_STROKE} aria-hidden="true" />
              带回分析助手
            </a>
            <span className="text-[12px] leading-5 text-label-2">只发送你当前打开的商品页，并去掉顶部的账号和地址栏</span>
          </div>
        </div>
      </div>
    </div>
  );
}
