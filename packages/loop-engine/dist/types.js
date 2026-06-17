// Loop 状态枚举
export var LoopState;
(function (LoopState) {
    LoopState["IDLE"] = "idle";
    LoopState["INTERROGATING"] = "interrogating";
    LoopState["PLANNING"] = "planning";
    LoopState["EXECUTING"] = "executing";
    LoopState["VERIFYING"] = "verifying";
    LoopState["EVOLVING"] = "evolving";
    LoopState["DONE"] = "done";
})(LoopState || (LoopState = {}));
//# sourceMappingURL=types.js.map