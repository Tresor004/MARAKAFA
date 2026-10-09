<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PendingActionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => (string) $this->id,
            'kind' => $this->kind,
            'module' => $this->module,
            'action' => $this->action,
            'description' => $this->description,
            'details' => $this->details,
            'status' => $this->status,
            'request_date' => $this->request_date?->toDateString(),
            'reviewed_at' => $this->reviewed_at?->toIso8601String(),
            'reject_reason' => $this->reject_reason,
            'requested_by' => $this->requester?->name,
            'reviewed_by' => $this->reviewer?->name,
        ];
    }
}
