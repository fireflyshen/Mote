export function DraftNotice({
    conflict,
    restored,
    localError,
    onAccept,
    onDiscard,
}: {
    conflict: boolean;
    restored: boolean;
    localError?: boolean;
    onAccept: () => void;
    onDiscard: () => void;
}) {
    if (!conflict && !restored && !localError) return null;
    return (
        <div
            className="draft-notice"
            role={conflict || localError ? "alert" : "status"}
        >
            <span>
                {localError
                    ? "本机暂存不可用，请保持页面打开并完成保存。"
                    : conflict
                      ? "线上记录已有更新，请核对草稿。"
                      : "已恢复本机草稿"}
            </span>
            {conflict && (
                <button
                    type="button"
                    className="text-button"
                    onClick={onAccept}
                >
                    核对后保留草稿
                </button>
            )}
            <button type="button" className="text-button" onClick={onDiscard}>
                放弃草稿
            </button>
        </div>
    );
}
