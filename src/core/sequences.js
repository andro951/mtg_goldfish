import { requireRule, clone } from './util.js';
const allowed=new Set(['ACTIVATE_ABILITY','CAST_SPELL','PLAY_LAND','SPECIAL_ACTION','CHOOSE','REVISE_DRAFT_INPUT','RESOLVE_TOP']);
export const sequenceMethods={
  runSequence(action){
    requireRule(!this.state.pending&&!this.state.actionDraft&&!this.state.resolving,'Finish the current decision before running a sequence.','SEQUENCE_BUSY');
    requireRule(Array.isArray(action.commands)&&action.commands.length>0&&action.commands.length<=256,'A sequence needs 1–256 recorded gameplay commands.','SEQUENCE_LIMIT');
    const start=this.state.eventSerial;
    for(const command of action.commands){
      requireRule(command&&allowed.has(command.type),'Sequence contains a non-gameplay command.','SEQUENCE_ACTION');
      this.touch();this.handleAction(clone(command));this.settle();
    }
    requireRule(!this.state.pending&&!this.state.actionDraft&&!this.state.resolving,'Sequence ended at an unanswered decision.','SEQUENCE_INCOMPLETE');
    this.record('PLAYER_SEQUENCE_COMPLETED',{name:String(action.name||'Sequence').slice(0,120),commands:action.commands.length,startedAtEvent:start});
  },
};
