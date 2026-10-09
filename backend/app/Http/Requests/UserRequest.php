<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UserRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $userId = $this->route('user')?->id;
        $password = $this->isMethod('post') ? ['required', 'string', 'min:8'] : ['nullable', 'string', 'min:8'];

        return [
            'name' => [$this->isMethod('post') ? 'required' : 'sometimes', 'string', 'max:255'],
            'email' => [$this->isMethod('post') ? 'required' : 'sometimes', 'email', 'max:255', Rule::unique('users')->ignore($userId)],
            'phone' => ['nullable', 'string', 'max:30'],
            'password' => $password,
            'role_id' => [$this->isMethod('post') ? 'required' : 'sometimes', 'integer', 'exists:roles,id'],
            'active' => ['nullable', 'boolean'],
        ];
    }
}
